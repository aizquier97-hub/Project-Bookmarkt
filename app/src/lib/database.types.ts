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
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      ai_feedback_reports: {
        Row: {
          audit_id: string | null
          created_at: string
          feedback_text: string
          id: number
          source_boundary: string | null
          source_id: string | null
          source_text_excerpt: string | null
          source_type: string
          topic_id: number | null
          user_id: string
        }
        Insert: {
          audit_id?: string | null
          created_at?: string
          feedback_text: string
          id?: number
          source_boundary?: string | null
          source_id?: string | null
          source_text_excerpt?: string | null
          source_type: string
          topic_id?: number | null
          user_id: string
        }
        Update: {
          audit_id?: string | null
          created_at?: string
          feedback_text?: string
          id?: number
          source_boundary?: string | null
          source_id?: string | null
          source_text_excerpt?: string | null
          source_type?: string
          topic_id?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_feedback_reports_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_generated_artifacts: {
        Row: {
          audit_id: string
          created_at: string
          id: number
          source_id: string
          source_type: string
          topic_id: number | null
          user_id: string
        }
        Insert: {
          audit_id: string
          created_at?: string
          id?: number
          source_id: string
          source_type: string
          topic_id?: number | null
          user_id: string
        }
        Update: {
          audit_id?: string
          created_at?: string
          id?: number
          source_id?: string
          source_type?: string
          topic_id?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_generated_artifacts_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "ai_generation_audit"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_generated_artifacts_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_generation_audit: {
        Row: {
          characters_debug: Json
          created_at: string
          id: string
          lower_boundary: number | null
          progress_type: string | null
          request_payload: Json
          source_mode: string
          spoiler_boundary: string | null
          summary_debug: Json
          topic_id: number | null
          upper_boundary: number | null
          user_id: string
        }
        Insert: {
          characters_debug?: Json
          created_at?: string
          id: string
          lower_boundary?: number | null
          progress_type?: string | null
          request_payload?: Json
          source_mode?: string
          spoiler_boundary?: string | null
          summary_debug?: Json
          topic_id?: number | null
          upper_boundary?: number | null
          user_id: string
        }
        Update: {
          characters_debug?: Json
          created_at?: string
          id?: string
          lower_boundary?: number | null
          progress_type?: string | null
          request_payload?: Json
          source_mode?: string
          spoiler_boundary?: string | null
          summary_debug?: Json
          topic_id?: number | null
          upper_boundary?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_generation_audit_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_events: {
        Row: {
          audit_id: string | null
          completed_at: string | null
          duration_ms: number | null
          error_code: string | null
          error_message: string | null
          http_status: number | null
          id: number
          mode: string
          quota_scope: string | null
          started_at: string
          status: string
          upstream_status: number | null
          user_id: string
        }
        Insert: {
          audit_id?: string | null
          completed_at?: string | null
          duration_ms?: number | null
          error_code?: string | null
          error_message?: string | null
          http_status?: number | null
          id?: number
          mode: string
          quota_scope?: string | null
          started_at?: string
          status?: string
          upstream_status?: number | null
          user_id: string
        }
        Update: {
          audit_id?: string | null
          completed_at?: string | null
          duration_ms?: number | null
          error_code?: string | null
          error_message?: string | null
          http_status?: number | null
          id?: number
          mode?: string
          quota_scope?: string | null
          started_at?: string
          status?: string
          upstream_status?: number | null
          user_id?: string
        }
        Relationships: []
      }
      analytics_events: {
        Row: {
          created_at: string
          event_name: string
          event_properties: Json
          id: number
          topic_id: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          event_name: string
          event_properties?: Json
          id?: number
          topic_id?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          event_name?: string
          event_properties?: Json
          id?: number
          topic_id?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analytics_events_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      book_images: {
        Row: {
          caption: string | null
          created_at: string
          id: number
          image_url: string
          topic_id: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          id?: number
          image_url: string
          topic_id: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          id?: number
          image_url?: string
          topic_id?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "book_images_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      bookmark_events: {
        Row: {
          bookmark_id: string
          created_at: string
          event: string
          id: number
          topic_id: number | null
          user_id: string | null
        }
        Insert: {
          bookmark_id: string
          created_at?: string
          event: string
          id?: never
          topic_id?: number | null
          user_id?: string | null
        }
        Update: {
          bookmark_id?: string
          created_at?: string
          event?: string
          id?: never
          topic_id?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookmark_events_bookmark_id_fkey"
            columns: ["bookmark_id"]
            isOneToOne: false
            referencedRelation: "bookmarks"
            referencedColumns: ["id"]
          },
        ]
      }
      bookmarks: {
        Row: {
          claimed_at: string | null
          code: string
          created_at: string
          id: string
          linked_at: string | null
          topic_id: number | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          claimed_at?: string | null
          code: string
          created_at?: string
          id?: string
          linked_at?: string | null
          topic_id?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          claimed_at?: string | null
          code?: string
          created_at?: string
          id?: string
          linked_at?: string | null
          topic_id?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookmarks_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      characters: {
        Row: {
          created_at: string | null
          description: string
          id: number
          name: string
          topic_id: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          description: string
          id?: never
          name: string
          topic_id?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string
          id?: never
          name?: string
          topic_id?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "characters_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      entries: {
        Row: {
          created_at: string | null
          id: number
          text: string
          topic_id: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: never
          text: string
          topic_id?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: never
          text?: string
          topic_id?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entries_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      issue_reports: {
        Row: {
          assigned_to: string | null
          context: Json
          created_at: string
          description: string
          id: number
          kind: string
          priority: string | null
          resolution_notes: string | null
          resolved_at: string | null
          status: string
          topic_id: number | null
          user_id: string
        }
        Insert: {
          assigned_to?: string | null
          context?: Json
          created_at?: string
          description: string
          id?: number
          kind?: string
          priority?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          status?: string
          topic_id?: number | null
          user_id: string
        }
        Update: {
          assigned_to?: string | null
          context?: Json
          created_at?: string
          description?: string
          id?: number
          kind?: string
          priority?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          status?: string
          topic_id?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "issue_reports_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      spoiler_reports: {
        Row: {
          assigned_to: string | null
          audit_id: string | null
          boundary_label: string | null
          created_at: string
          id: number
          priority: string | null
          reason: string
          resolution_notes: string | null
          resolved_at: string | null
          status: string
          summary_excerpt: string | null
          topic_id: number | null
          user_id: string
        }
        Insert: {
          assigned_to?: string | null
          audit_id?: string | null
          boundary_label?: string | null
          created_at?: string
          id?: number
          priority?: string | null
          reason: string
          resolution_notes?: string | null
          resolved_at?: string | null
          status?: string
          summary_excerpt?: string | null
          topic_id?: number | null
          user_id: string
        }
        Update: {
          assigned_to?: string | null
          audit_id?: string | null
          boundary_label?: string | null
          created_at?: string
          id?: number
          priority?: string | null
          reason?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          status?: string
          summary_excerpt?: string | null
          topic_id?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "spoiler_reports_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      topics: {
        Row: {
          author: string | null
          created_at: string | null
          id: number
          name: string
          publication_year: number | null
          publisher: string | null
          total_pages: number | null
          user_id: string | null
        }
        Insert: {
          author?: string | null
          created_at?: string | null
          id?: never
          name: string
          publication_year?: number | null
          publisher?: string | null
          total_pages?: number | null
          user_id?: string | null
        }
        Update: {
          author?: string | null
          created_at?: string | null
          id?: never
          name?: string
          publication_year?: number | null
          publisher?: string | null
          total_pages?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      ai_usage_daily_summary: {
        Row: {
          active_users: number | null
          average_duration_ms: number | null
          blocked: number | null
          failed: number | null
          generations: number | null
          mode: string | null
          p95_duration_ms: number | null
          succeeded: number | null
          usage_date: string | null
        }
        Relationships: []
      }
      ai_usage_user_daily_summary: {
        Row: {
          average_duration_ms: number | null
          blocked: number | null
          failed: number | null
          generations: number | null
          succeeded: number | null
          usage_date: string | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      consume_ai_daily_quota: {
        Args: {
          p_audit_id: string
          p_mode: string
          p_project_daily_limit: number
          p_user_daily_limit: number
          p_user_id: string
        }
        Returns: {
          allowed: boolean
          event_id: number
          project_limit: number
          project_remaining: number
          project_used: number
          quota_scope: string
          reset_at: string
          user_limit: number
          user_remaining: number
          user_used: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
