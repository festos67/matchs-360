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
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: string | null
          after_data: Json | null
          before_data: Json | null
          created_at: string
          id: string
          ip_address: string | null
          record_id: string | null
          request_id: string | null
          table_name: string
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          id?: string
          ip_address?: string | null
          record_id?: string | null
          request_id?: string | null
          table_name: string
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          id?: string
          ip_address?: string | null
          record_id?: string | null
          request_id?: string | null
          table_name?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      clubs: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          logo_url: string | null
          name: string
          primary_color: string
          referent_email: string | null
          referent_name: string | null
          secondary_color: string | null
          short_name: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          logo_url?: string | null
          name: string
          primary_color?: string
          referent_email?: string | null
          referent_name?: string | null
          secondary_color?: string | null
          short_name?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          primary_color?: string
          referent_email?: string | null
          referent_name?: string | null
          secondary_color?: string | null
          short_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      competence_frameworks: {
        Row: {
          archived_at: string | null
          club_id: string | null
          created_at: string
          id: string
          is_archived: boolean
          is_template: boolean
          name: string
          team_id: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          club_id?: string | null
          created_at?: string
          id?: string
          is_archived?: boolean
          is_template?: boolean
          name: string
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          club_id?: string | null
          created_at?: string
          id?: string
          is_archived?: boolean
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
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
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
          created_at: string
          date: string
          deleted_at: string | null
          evaluator_id: string
          framework_id: string
          id: string
          name: string
          notes: string | null
          player_id: string
          type: Database["public"]["Enums"]["evaluation_type"]
        }
        Insert: {
          created_at?: string
          date?: string
          deleted_at?: string | null
          evaluator_id: string
          framework_id: string
          id?: string
          name: string
          notes?: string | null
          player_id: string
          type?: Database["public"]["Enums"]["evaluation_type"]
        }
        Update: {
          created_at?: string
          date?: string
          deleted_at?: string | null
          evaluator_id?: string
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
            columns: ["evaluator_id"]
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
      framework_snapshots: {
        Row: {
          created_at: string
          framework_id: string
          id: string
          snapshot: Json
        }
        Insert: {
          created_at?: string
          framework_id: string
          id?: string
          snapshot: Json
        }
        Update: {
          created_at?: string
          framework_id?: string
          id?: string
          snapshot?: Json
        }
        Relationships: []
      }
      invitation_send_log: {
        Row: {
          caller_role: string
          club_id: string
          created_at: string
          error_message: string | null
          id: string
          intended_role: string
          invited_by: string
          recipient_email_hash: string
          status: string
        }
        Insert: {
          caller_role: string
          club_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          intended_role: string
          invited_by: string
          recipient_email_hash: string
          status: string
        }
        Update: {
          caller_role?: string
          club_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          intended_role?: string
          invited_by?: string
          recipient_email_hash?: string
          status?: string
        }
        Relationships: []
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
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          link: string | null
          message: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          message?: string | null
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          message?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      objective_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_path: string
          file_size: number | null
          file_type: string | null
          id: string
          objective_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_path: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          objective_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          objective_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "objective_attachments_objective_id_fkey"
            columns: ["objective_id"]
            isOneToOne: false
            referencedRelation: "team_objectives"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_limits: {
        Row: {
          can_compare_multi_source: boolean
          can_export_pdf: boolean
          can_version_framework: boolean
          max_coach_evals_per_player: number
          max_coaches_per_team: number
          max_objectives_per_player: number
          max_players_per_team: number
          max_self_evals_per_player: number
          max_supporter_evals_per_player: number
          max_supporters_per_team: number
          max_team_objectives: number
          max_teams: number
          plan: Database["public"]["Enums"]["subscription_plan"]
        }
        Insert: {
          can_compare_multi_source?: boolean
          can_export_pdf?: boolean
          can_version_framework?: boolean
          max_coach_evals_per_player: number
          max_coaches_per_team: number
          max_objectives_per_player: number
          max_players_per_team: number
          max_self_evals_per_player: number
          max_supporter_evals_per_player: number
          max_supporters_per_team: number
          max_team_objectives: number
          max_teams: number
          plan: Database["public"]["Enums"]["subscription_plan"]
        }
        Update: {
          can_compare_multi_source?: boolean
          can_export_pdf?: boolean
          can_version_framework?: boolean
          max_coach_evals_per_player?: number
          max_coaches_per_team?: number
          max_objectives_per_player?: number
          max_players_per_team?: number
          max_self_evals_per_player?: number
          max_supporter_evals_per_player?: number
          max_supporters_per_team?: number
          max_team_objectives?: number
          max_teams?: number
          plan?: Database["public"]["Enums"]["subscription_plan"]
        }
        Relationships: []
      }
      player_objective_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_path: string
          file_size: number | null
          file_type: string | null
          id: string
          objective_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_path: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          objective_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          objective_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_objective_attachments_objective_id_fkey"
            columns: ["objective_id"]
            isOneToOne: false
            referencedRelation: "player_objectives"
            referencedColumns: ["id"]
          },
        ]
      }
      player_objectives: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_priority: boolean
          order_index: number
          player_id: string
          priority: number
          status: string
          team_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          is_priority?: boolean
          order_index?: number
          player_id: string
          priority?: number
          status?: string
          team_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_priority?: boolean
          order_index?: number
          player_id?: string
          priority?: number
          status?: string
          team_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_objectives_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_objectives_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_objectives_team_id_fkey"
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
      subscriptions: {
        Row: {
          amount_cents: number | null
          auto_renew: boolean
          club_id: string
          created_at: string
          ends_at: string
          id: string
          is_trial: boolean
          plan: Database["public"]["Enums"]["subscription_plan"]
          renewed_from: string | null
          season_end: string
          season_start: string
          source: Database["public"]["Enums"]["subscription_source"]
          starts_at: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
        }
        Insert: {
          amount_cents?: number | null
          auto_renew?: boolean
          club_id: string
          created_at?: string
          ends_at: string
          id?: string
          is_trial?: boolean
          plan?: Database["public"]["Enums"]["subscription_plan"]
          renewed_from?: string | null
          season_end: string
          season_start: string
          source?: Database["public"]["Enums"]["subscription_source"]
          starts_at: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number | null
          auto_renew?: boolean
          club_id?: string
          created_at?: string
          ends_at?: string
          id?: string
          is_trial?: boolean
          plan?: Database["public"]["Enums"]["subscription_plan"]
          renewed_from?: string | null
          season_end?: string
          season_start?: string
          source?: Database["public"]["Enums"]["subscription_source"]
          starts_at?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_renewed_from_fkey"
            columns: ["renewed_from"]
            isOneToOne: false
            referencedRelation: "subscriptions"
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
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      team_members: {
        Row: {
          archived_reason: string | null
          coach_role: Database["public"]["Enums"]["coach_type"] | null
          created_at: string
          deleted_at: string | null
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
          deleted_at?: string | null
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
          deleted_at?: string | null
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
      team_objectives: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_priority: boolean
          order_index: number
          priority: number
          status: string
          team_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          is_priority?: boolean
          order_index?: number
          priority?: number
          status?: string
          team_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_priority?: boolean
          order_index?: number
          priority?: number
          status?: string
          team_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_objectives_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_objectives_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
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
          short_name: string | null
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
          short_name?: string | null
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
          short_name?: string | null
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
      _admin_list_users_check_caller: {
        Args: { p_caller: string; p_club_filter: string; p_is_admin: boolean }
        Returns: string[]
      }
      _log_plan_limit_bypass: {
        Args: {
          p_club_id: string
          p_limit_kind: string
          p_record_id: string
          p_table: string
        }
        Returns: undefined
      }
      admin_get_auth_users_bulk: {
        Args: { p_user_ids: string[] }
        Returns: {
          banned_until: string
          created_at: string
          email: string
          email_confirmed_at: string
          id: string
          last_sign_in_at: string
        }[]
      }
      admin_get_user_by_email: {
        Args: { p_email: string }
        Returns: {
          id: string
        }[]
      }
      admin_list_users_paginated: {
        Args: {
          p_caller: string
          p_club_filter?: string
          p_coach_filter?: string
          p_is_admin: boolean
          p_page: number
          p_player_filter?: string
          p_role_filter?: string
          p_search?: string
          p_size: number
        }
        Returns: {
          out_total_count: number
          out_user_id: string
        }[]
      }
      calculate_prorata_amount: {
        Args: { p_full_price_cents?: number; p_start_date: string }
        Returns: number
      }
      can_write_objective_attachment: {
        Args: { _path: string; _user_id: string }
        Returns: boolean
      }
      cancel_invitation: { Args: { _invitation_id: string }; Returns: Json }
      create_club_with_referent: {
        Args: {
          _name: string
          _primary_color: string
          _referent_email: string
          _referent_first_name: string
          _referent_last_name: string
          _secondary_color: string
          _short_name: string
        }
        Returns: Json
      }
      create_trial_notifications: { Args: never; Returns: undefined }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      expire_overdue_invitations: { Args: never; Returns: number }
      get_club_plan: {
        Args: { p_club_id: string }
        Returns: Database["public"]["Enums"]["subscription_plan"]
      }
      get_coach_player_ids: { Args: { _coach_id: string }; Returns: string[] }
      get_current_season: {
        Args: never
        Returns: {
          season_end: string
          season_start: string
        }[]
      }
      get_invitation_quota_remaining: {
        Args: { p_caller: string }
        Returns: {
          limit_per_hour: number
          reset_at: string
          used: number
        }[]
      }
      get_player_club_id: { Args: { _player_id: string }; Returns: string }
      get_referent_coach_team_ids: {
        Args: { _user_id: string }
        Returns: string[]
      }
      get_supporter_player_team_ids: {
        Args: { _supporter_id: string }
        Returns: string[]
      }
      get_teammate_user_ids: { Args: { _user_id: string }; Returns: string[] }
      get_user_club_admin_ids: { Args: { _user_id: string }; Returns: string[] }
      get_user_club_ids: { Args: { _user_id: string }; Returns: string[] }
      get_user_team_ids: { Args: { _user_id: string }; Returns: string[] }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      import_framework_atomic: {
        Args: {
          p_framework_name: string
          p_source_framework_id: string
          p_target_club_id: string
          p_target_team_id: string
        }
        Returns: string
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
      is_coach_of_player: {
        Args: { _coach_id: string; _player_id: string }
        Returns: boolean
      }
      is_coach_of_team: {
        Args: { _team_id: string; _user_id: string }
        Returns: boolean
      }
      is_plan_bypass_active: { Args: never; Returns: boolean }
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
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      purge_old_audit_log: { Args: never; Returns: undefined }
      purge_old_evaluations: { Args: never; Returns: undefined }
      purge_old_frameworks: { Args: never; Returns: undefined }
      purge_old_invitation_send_log: { Args: never; Returns: undefined }
      purge_old_invitations: { Args: never; Returns: number }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      resend_invitation: {
        Args: { _invitation_id: string; _new_expires_days?: number }
        Returns: Json
      }
      soft_delete_club: { Args: { _club_id: string }; Returns: undefined }
      validate_storage_url:
        | { Args: { _bucket: string; _url: string }; Returns: boolean }
        | {
            Args: { _bucket: string; _owner_segment?: string; _url: string }
            Returns: boolean
          }
    }
    Enums: {
      app_role: "admin" | "club_admin" | "coach" | "player" | "supporter"
      coach_type: "referent" | "assistant"
      evaluation_type: "coach" | "self" | "supporter"
      subscription_plan: "free" | "pro"
      subscription_source:
        | "direct"
        | "trial"
        | "district"
        | "league"
        | "federation"
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
      evaluation_type: ["coach", "self", "supporter"],
      subscription_plan: ["free", "pro"],
      subscription_source: [
        "direct",
        "trial",
        "district",
        "league",
        "federation",
      ],
    },
  },
} as const
