export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      clubs: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          logo_url: string | null
          name: string
          primary_color: string
          referent_email: string | null
          referent_name: string | null
          secondary_color: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          logo_url?: string | null
          name: string
          primary_color?: string
          referent_email?: string | null
          referent_name?: string | null
          secondary_color?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          primary_color?: string
          referent_email?: string | null
          referent_name?: string | null
          secondary_color?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      competence_frameworks: {
        Row: {
          club_id: string | null
          created_at: string
          id: string
          is_template: boolean
          name: string
          team_id: string | null
          updated_at: string
        }
        Insert: {
          club_id?: string | null
          created_at?: string
          id?: string
          is_template?: boolean
          name: string
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          club_id?: string | null
          created_at?: string
          id?: string
          is_template?: boolean
          name?: string
          team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "competence_frameworks_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competence_frameworks_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluation_objectives: {
        Row: {
          content: string
          created_at: string
          deadline: string | null
          evaluation_id: string
          id: string
          theme_id: string
        }
        Insert: {
          content: string
          created_at?: string
          deadline?: string | null
          evaluation_id: string
          id?: string
          theme_id: string
        }
        Update: {
          content?: string
          created_at?: string
          deadline?: string | null
          evaluation_id?: string
          id?: string
          theme_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evaluation_objectives_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_objectives_theme_id_fkey"
            columns: ["theme_id"]
            isOneToOne: false
            referencedRelation: "themes"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluation_scores: {
        Row: {
          comment: string | null
          created_at: string
          evaluation_id: string
          id: string
          is_not_observed: boolean
          score: number | null
          skill_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          evaluation_id: string
          id?: string
          is_not_observed?: boolean
          score?: number | null
          skill_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          evaluation_id?: string
          id?: string
          is_not_observed?: boolean
          score?: number | null
          skill_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evaluation_scores_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_scores_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluations: {
        Row: {
          coach_id: string
          created_at: string
          date: string
          deleted_at: string | null
          framework_id: string
          id: string
          name: string
          notes: string | null
          player_id: string
          type: Database["public"]["Enums"]["evaluation_type"]
        }
        Insert: {
          coach_id: string
          created_at?: string
          date?: string
          deleted_at?: string | null
          framework_id: string
          id?: string
          name: string
          notes?: string | null
          player_id: string
          type?: Database["public"]["Enums"]["evaluation_type"]
        }
        Update: {
          coach_id?: string
          created_at?: string
          date?: string
          deleted_at?: string | null
          framework_id?: string
          id?: string
          name?: string
          notes?: string | null
          player_id?: string
          type?: Database["public"]["Enums"]["evaluation_type"]
        }
        Relationships: [
          {
            foreignKeyName: "evaluations_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluations_framework_id_fkey"
            columns: ["framework_id"]
            isOneToOne: false
            referencedRelation: "competence_frameworks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluations_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          club_id: string | null
          coach_role: Database["public"]["Enums"]["coach_type"] | null
          created_at: string
          email: string
          expires_at: string
          id: string
          intended_role: Database["public"]["Enums"]["app_role"]
          invited_by: string | null
          status: string
          team_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          club_id?: string | null
          coach_role?: Database["public"]["Enums"]["coach_type"] | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          intended_role: Database["public"]["Enums"]["app_role"]
          invited_by?: string | null
          status?: string
          team_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          club_id?: string | null
          coach_role?: Database["public"]["Enums"]["coach_type"] | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          intended_role?: Database["public"]["Enums"]["app_role"]
          invited_by?: string | null
          status?: string
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invitations_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          club_id: string | null
          created_at: string
          deleted_at: string | null
          email: string
          first_name: string | null
          id: string
          last_name: string | null
          nickname: string | null
          photo_url: string | null
          updated_at: string
        }
        Insert: {
          club_id?: string | null
          created_at?: string
          deleted_at?: string | null
          email: string
          first_name?: string | null
          id: string
          last_name?: string | null
          nickname?: string | null
          photo_url?: string | null
          updated_at?: string
        }
        Update: {
          club_id?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          nickname?: string | null
          photo_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      role_requests: {
        Row: {
          created_at: string
          id: string
          rejection_reason: string | null
          requested_role: Database["public"]["Enums"]["app_role"]
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          rejection_reason?: string | null
          requested_role: Database["public"]["Enums"]["app_role"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          rejection_reason?: string | null
          requested_role?: Database["public"]["Enums"]["app_role"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      skills: {
        Row: {
          created_at: string
          definition: string | null
          id: string
          name: string
          order_index: number
          theme_id: string
        }
        Insert: {
          created_at?: string
          definition?: string | null
          id?: string
          name: string
          order_index?: number
          theme_id: string
        }
        Update: {
          created_at?: string
          definition?: string | null
          id?: string
          name?: string
          order_index?: number
          theme_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "skills_theme_id_fkey"
            columns: ["theme_id"]
            isOneToOne: false
            referencedRelation: "themes"
            referencedColumns: ["id"]
          },
        ]
      }
      supporter_evaluation_requests: {
        Row: {
          completed_at: string | null
          created_at: string
          evaluation_id: string | null
          expires_at: string
          id: string
          player_id: string
          requested_by: string
          status: string
          supporter_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          evaluation_id?: string | null
          expires_at?: string
          id?: string
          player_id: string
          requested_by: string
          status?: string
          supporter_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          evaluation_id?: string | null
          expires_at?: string
          id?: string
          player_id?: string
          requested_by?: string
          status?: string
          supporter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supporter_evaluation_requests_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supporter_evaluation_requests_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supporter_evaluation_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supporter_evaluation_requests_supporter_id_fkey"
            columns: ["supporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      supporters_link: {
        Row: {
          created_at: string
          id: string
          player_id: string
          supporter_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          player_id: string
          supporter_id: string
        }
        Update: {
          created_at?: string
          id?: string
          player_id?: string
          supporter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supporters_link_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supporters_link_supporter_id_fkey"
            columns: ["supporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          archived_reason: string | null
          coach_role: Database["public"]["Enums"]["coach_type"] | null
          created_at: string
          id: string
          is_active: boolean
          joined_at: string
          left_at: string | null
          member_type: string
          team_id: string
          user_id: string
        }
        Insert: {
          archived_reason?: string | null
          coach_role?: Database["public"]["Enums"]["coach_type"] | null
          created_at?: string
          id?: string
          is_active?: boolean
          joined_at?: string
          left_at?: string | null
          member_type: string
          team_id: string
          user_id: string
        }
        Update: {
          archived_reason?: string | null
          coach_role?: Database["public"]["Enums"]["coach_type"] | null
          created_at?: string
          id?: string
          is_active?: boolean
          joined_at?: string
          left_at?: string | null
          member_type?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          club_id: string
          color: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          name: string
          season: string | null
          updated_at: string
        }
        Insert: {
          club_id: string
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          name: string
          season?: string | null
          updated_at?: string
        }
        Update: {
          club_id?: string
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          name?: string
          season?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      themes: {
        Row: {
          color: string | null
          created_at: string
          framework_id: string
          id: string
          name: string
          order_index: number
        }
        Insert: {
          color?: string | null
          created_at?: string
          framework_id: string
          id?: string
          name: string
          order_index?: number
        }
        Update: {
          color?: string | null
          created_at?: string
          framework_id?: string
          id?: string
          name?: string
          order_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "themes_framework_id_fkey"
            columns: ["framework_id"]
            isOneToOne: false
            referencedRelation: "competence_frameworks"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          club_id: string | null
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          club_id?: string | null
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          club_id?: string | null
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_club_admin_ids: { Args: { _user_id: string }; Returns: string[] }
      get_user_club_ids: { Args: { _user_id: string }; Returns: string[] }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_club_admin: {
        Args: { _club_id: string; _user_id: string }
        Returns: boolean
      }
      is_club_admin_of_team: {
        Args: { _team_id: string; _user_id: string }
        Returns: boolean
      }
      is_coach_of_team: {
        Args: { _team_id: string; _user_id: string }
        Returns: boolean
      }
      is_player_in_team: {
        Args: { _team_id: string; _user_id: string }
        Returns: boolean
      }
      is_referent_coach_of_team: {
        Args: { _team_id: string; _user_id: string }
        Returns: boolean
      }
      is_supporter_of_player: {
        Args: { _player_id: string; _supporter_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "club_admin" | "coach" | "player" | "supporter"
      coach_type: "referent" | "assistant"
      evaluation_type:
        | "coach_assessment"
        | "player_self_assessment"
        | "supporter_assessment"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "club_admin", "coach", "player", "supporter"],
      coach_type: ["referent", "assistant"],
      evaluation_type: [
        "coach_assessment",
        "player_self_assessment",
        "supporter_assessment",
      ],
    },
  },
} as const
