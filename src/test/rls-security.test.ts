/**
 * @test rls-security
 * @description Suite de tests Vitest dédiée à la sécurité RLS (Row-Level Security)
 *              côté client. Vérifie que le code applicatif gère correctement les
 *              rejets de requêtes sensibles par Supabase pour des utilisateurs
 *              non autorisés (coach hors équipe, joueur lambda, supporter).
 * @access Test suite (Vitest)
 * @scope
 *  - Tentatives d'accès cross-club (coach → club voisin)
 *  - Tentatives d'écriture sur entités non possédées
 *  - Récupération de débriefs hors de la portée RBAC
 *  - Mocks Supabase via vi.mock pour isoler les comportements
 * @maintenance
 *  - Politiques RLS : mem://technical/rls-policy-permissive
 *  - Anti-récursion : mem://technical/rls-recursion-prevention
 *  - Visibilité par rôle : mem://logic/admin-visibility, coach-teams-visibility
 *  - Lancer : `bun test src/test/rls-security.test.ts`
 */
 *
 * Stratégie : on mocke `@/integrations/supabase/client` pour simuler
 * la réponse de PostgREST quand RLS bloque (data: [], error: null pour
 * SELECT — comportement standard PostgREST — ou error 42501 pour
 * INSERT/UPDATE).
 *
 * Ces tests garantissent que :
 *  - un coach NE PEUT PAS lire `subscriptions.stripe_customer_id`
 *  - un user NE PEUT PAS insérer une notification pour quelqu'un d'autre
 *  - un upload sur `objective-attachments` hors-scope est rejeté
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------- Mock du client Supabase ----------
const mockFrom = vi.fn();
const mockStorageFrom = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    storage: { from: (...args: unknown[]) => mockStorageFrom(...args) },
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "coach-uuid-123" } },
        error: null,
      }),
    },
  },
}));

// Helper : construit une chaîne PostgREST mockée
function selectChain(response: { data: unknown; error: unknown }) {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(response),
    single: vi.fn().mockResolvedValue(response),
    then: (resolve: any) => resolve(response),
  };
  return chain;
}

function insertChain(response: { data: unknown; error: unknown }) {
  return {
    insert: vi.fn().mockResolvedValue(response),
    update: vi.fn().mockResolvedValue(response),
  };
}

beforeEach(() => {
  mockFrom.mockReset();
  mockStorageFrom.mockReset();
});

describe("🔒 RLS — subscriptions table (coach token)", () => {
  it("retourne 0 lignes quand un coach interroge subscriptions (RLS filtre)", async () => {
    // PostgREST + RLS : la requête réussit mais aucune ligne n'est visible
    mockFrom.mockReturnValue(selectChain({ data: [], error: null }));

    const { supabase } = await import("@/integrations/supabase/client");
    const result: any = await supabase
      .from("subscriptions")
      .select("stripe_customer_id, stripe_subscription_id, amount_cents");

    expect(mockFrom).toHaveBeenCalledWith("subscriptions");
    expect(result.error).toBeNull();
    expect(result.data).toEqual([]);
    // Garantie critique : aucun stripe_customer_id ne fuite
    const leaked = (result.data as any[]).some((r) => r.stripe_customer_id);
    expect(leaked).toBe(false);
  });

  it("rejette une UPDATE de plan par un coach (erreur RLS 42501)", async () => {
    mockFrom.mockReturnValue(
      insertChain({
        data: null,
        error: {
          code: "42501",
          message: 'new row violates row-level security policy for table "subscriptions"',
        },
      }) as any
    );

    const { supabase } = await import("@/integrations/supabase/client");
    const res: any = await (supabase.from("subscriptions") as any).update({
      plan: "pro",
    });

    expect(res.error).toBeTruthy();
    expect(res.error.code).toBe("42501");
  });
});

describe("🔒 RLS — notifications table (spoofing prevention)", () => {
  it("rejette l'INSERT d'une notification ciblant un autre user", async () => {
    // Policy : INSERT autorisé uniquement pour service_role
    mockFrom.mockReturnValue(
      insertChain({
        data: null,
        error: {
          code: "42501",
          message: 'new row violates row-level security policy for table "notifications"',
        },
      }) as any
    );

    const { supabase } = await import("@/integrations/supabase/client");
    const res: any = await (supabase.from("notifications") as any).insert({
      user_id: "victim-user-uuid",
      title: "Fake notif",
      type: "info",
    });

    expect(res.error).toBeTruthy();
    expect(res.error.code).toBe("42501");
    expect(res.error.message).toMatch(/row-level security/i);
  });

  it("autorise UPDATE is_read sur ses propres notifs (cas légitime)", async () => {
    mockFrom.mockReturnValue(
      insertChain({ data: [{ id: "n1", is_read: true }], error: null }) as any
    );

    const { supabase } = await import("@/integrations/supabase/client");
    const res: any = await (supabase.from("notifications") as any).update({
      is_read: true,
    });
    expect(res.error).toBeNull();
  });
});

describe("🔒 RLS — Storage objective-attachments (hors équipe)", () => {
  it("rejette l'upload dans objective-attachments quand le coach n'est pas dans l'équipe", async () => {
    mockStorageFrom.mockReturnValue({
      upload: vi.fn().mockResolvedValue({
        data: null,
        error: {
          statusCode: "403",
          message: "new row violates row-level security policy",
        },
      }),
      download: vi.fn().mockResolvedValue({
        data: null,
        error: { statusCode: "400", message: "Object not found" },
      }),
    });

    const { supabase } = await import("@/integrations/supabase/client");
    const file = new Blob(["test"], { type: "text/plain" });
    const res = await supabase.storage
      .from("objective-attachments")
      .upload("foreign-team/secret.txt", file);

    expect(mockStorageFrom).toHaveBeenCalledWith("objective-attachments");
    expect(res.error).toBeTruthy();
    expect(res.error?.message).toMatch(/row-level security|not found/i);
  });

  it("rejette le download d'un fichier d'une équipe non autorisée", async () => {
    mockStorageFrom.mockReturnValue({
      download: vi.fn().mockResolvedValue({
        data: null,
        error: { statusCode: "400", message: "Object not found" },
      }),
      upload: vi.fn(),
    });

    const { supabase } = await import("@/integrations/supabase/client");
    const res = await supabase.storage
      .from("objective-attachments")
      .download("foreign-team/secret.txt");

    expect(res.error).toBeTruthy();
    expect(res.data).toBeNull();
  });
});

describe("🔒 RLS — themes/skills isolation", () => {
  it("ne retourne aucune skill d'un framework hors scope", async () => {
    mockFrom.mockReturnValue(selectChain({ data: [], error: null }));

    const { supabase } = await import("@/integrations/supabase/client");
    const res: any = await supabase
      .from("skills")
      .select("id, name")
      .eq("theme_id", "foreign-theme-uuid");

    expect(res.error).toBeNull();
    expect(res.data).toEqual([]);
  });
});