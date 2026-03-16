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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          ip_address: string | null
          modified_for_user_id: string | null
          new_values: Json | null
          old_values: Json | null
          tenant_id: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          ip_address?: string | null
          modified_for_user_id?: string | null
          new_values?: Json | null
          old_values?: Json | null
          tenant_id: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          ip_address?: string | null
          modified_for_user_id?: string | null
          new_values?: Json | null
          old_values?: Json | null
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_modified_for_user_id_fkey"
            columns: ["modified_for_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      board_roles: {
        Row: {
          created_at: string
          description: string | null
          functional_area_id: string | null
          id: string
          name: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          functional_area_id?: string | null
          id?: string
          name: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          functional_area_id?: string | null
          id?: string
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "board_roles_functional_area_id_fkey"
            columns: ["functional_area_id"]
            isOneToOne: false
            referencedRelation: "functional_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      board_tasks: {
        Row: {
          created_at: string
          created_by_user_id: string
          deadline_date: string
          deadline_type: string
          description: string | null
          id: string
          linked_highlight_id: string | null
          linked_kpi_id: string | null
          meeting_id: string
          owner_user_id: string
          position: number
          source: string
          status: string
          suggested_task_id: string | null
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_user_id: string
          deadline_date: string
          deadline_type: string
          description?: string | null
          id?: string
          linked_highlight_id?: string | null
          linked_kpi_id?: string | null
          meeting_id: string
          owner_user_id: string
          position?: number
          source: string
          status?: string
          suggested_task_id?: string | null
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_user_id?: string
          deadline_date?: string
          deadline_type?: string
          description?: string | null
          id?: string
          linked_highlight_id?: string | null
          linked_kpi_id?: string | null
          meeting_id?: string
          owner_user_id?: string
          position?: number
          source?: string
          status?: string
          suggested_task_id?: string | null
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "board_tasks_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_tasks_linked_highlight_id_fkey"
            columns: ["linked_highlight_id"]
            isOneToOne: false
            referencedRelation: "highlights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_tasks_linked_kpi_id_fkey"
            columns: ["linked_kpi_id"]
            isOneToOne: false
            referencedRelation: "kpi_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_tasks_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_tasks_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_tasks_suggested_task_id_fkey"
            columns: ["suggested_task_id"]
            isOneToOne: false
            referencedRelation: "suggested_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          attendees_emails: string[]
          created_at: string
          end_time: string
          id: string
          meeting_id: string
          start_time: string
          sync_status: string
          teams_event_id: string | null
          tenant_id: string
          title: string
        }
        Insert: {
          attendees_emails?: string[]
          created_at?: string
          end_time: string
          id?: string
          meeting_id: string
          start_time: string
          sync_status?: string
          teams_event_id?: string | null
          tenant_id: string
          title: string
        }
        Update: {
          attendees_emails?: string[]
          created_at?: string
          end_time?: string
          id?: string
          meeting_id?: string
          start_time?: string
          sync_status?: string
          teams_event_id?: string | null
          tenant_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      commitments: {
        Row: {
          created_at: string
          description: string
          id: string
          meeting_id: string
          reviewed_at_meeting_id: string | null
          status: string
          tenant_id: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          meeting_id: string
          reviewed_at_meeting_id?: string | null
          status?: string
          tenant_id: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          meeting_id?: string
          reviewed_at_meeting_id?: string | null
          status?: string
          tenant_id?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commitments_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commitments_reviewed_at_meeting_id_fkey"
            columns: ["reviewed_at_meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commitments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commitments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      functional_areas: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "functional_areas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      highlights: {
        Row: {
          created_at: string
          description: string | null
          id: string
          meeting_id: string
          metric_name: string
          metric_trend: string | null
          metric_value: string
          position: number
          tenant_id: string
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          meeting_id: string
          metric_name: string
          metric_trend?: string | null
          metric_value: string
          position: number
          tenant_id: string
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          meeting_id?: string
          metric_name?: string
          metric_trend?: string | null
          metric_value?: string
          position?: number
          tenant_id?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "highlights_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "highlights_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "highlights_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      join_requests: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "join_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "join_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_definitions: {
        Row: {
          created_at: string
          direction: string
          id: string
          is_active: boolean
          name: string
          target_value: number | null
          tenant_id: string
          unit: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          direction?: string
          id?: string
          is_active?: boolean
          name: string
          target_value?: number | null
          tenant_id: string
          unit: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          direction?: string
          id?: string
          is_active?: boolean
          name?: string
          target_value?: number | null
          tenant_id?: string
          unit?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kpi_definitions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_definitions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_entries: {
        Row: {
          created_at: string
          current_value: number
          delta: number | null
          delta_percent: number | null
          id: string
          is_improved: boolean | null
          kpi_id: string
          meeting_id: string
          previous_value: number | null
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_value: number
          delta?: number | null
          delta_percent?: number | null
          id?: string
          is_improved?: boolean | null
          kpi_id: string
          meeting_id: string
          previous_value?: number | null
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_value?: number
          delta?: number | null
          delta_percent?: number | null
          id?: string
          is_improved?: boolean | null
          kpi_id?: string
          meeting_id?: string
          previous_value?: number | null
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kpi_entries_kpi_id_fkey"
            columns: ["kpi_id"]
            isOneToOne: false
            referencedRelation: "kpi_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_entries_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_variance_explanations: {
        Row: {
          created_at: string
          delta_portion: number | null
          delta_portion_percent: number | null
          direction: string
          id: string
          kpi_entry_id: string
          reason: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          delta_portion?: number | null
          delta_portion_percent?: number | null
          direction: string
          id?: string
          kpi_entry_id: string
          reason: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          delta_portion?: number | null
          delta_portion_percent?: number | null
          direction?: string
          id?: string
          kpi_entry_id?: string
          reason?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kpi_variance_explanations_kpi_entry_id_fkey"
            columns: ["kpi_entry_id"]
            isOneToOne: false
            referencedRelation: "kpi_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_variance_explanations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_briefs: {
        Row: {
          approved_at: string | null
          approved_by_user_id: string | null
          brief_pdf_url: string | null
          completed_users: number
          completion_status: Json
          created_at: string
          generated_at: string | null
          highlights_summary: string | null
          id: string
          kpi_summary: Json | null
          meeting_id: string
          open_tasks_count: number
          rejection_note: string | null
          status: string
          tenant_id: string
          total_users: number
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by_user_id?: string | null
          brief_pdf_url?: string | null
          completed_users?: number
          completion_status?: Json
          created_at?: string
          generated_at?: string | null
          highlights_summary?: string | null
          id?: string
          kpi_summary?: Json | null
          meeting_id: string
          open_tasks_count?: number
          rejection_note?: string | null
          status?: string
          tenant_id: string
          total_users?: number
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by_user_id?: string | null
          brief_pdf_url?: string | null
          completed_users?: number
          completion_status?: Json
          created_at?: string
          generated_at?: string | null
          highlights_summary?: string | null
          id?: string
          kpi_summary?: Json | null
          meeting_id?: string
          open_tasks_count?: number
          rejection_note?: string | null
          status?: string
          tenant_id?: string
          total_users?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_briefs_approved_by_user_id_fkey"
            columns: ["approved_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_briefs_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: true
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_briefs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
          ai_raw_output: Json | null
          created_at: string
          id: string
          pre_meeting_deadline: string
          presentation_url: string | null
          quarter: string
          scheduled_date: string
          status: string
          summary_docx_url: string | null
          summary_pdf_url: string | null
          tenant_id: string
          title: string
          transcript_url: string | null
          updated_at: string
          video_url: string | null
        }
        Insert: {
          ai_raw_output?: Json | null
          created_at?: string
          id?: string
          pre_meeting_deadline: string
          presentation_url?: string | null
          quarter: string
          scheduled_date: string
          status?: string
          summary_docx_url?: string | null
          summary_pdf_url?: string | null
          tenant_id: string
          title: string
          transcript_url?: string | null
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          ai_raw_output?: Json | null
          created_at?: string
          id?: string
          pre_meeting_deadline?: string
          presentation_url?: string | null
          quarter?: string
          scheduled_date?: string
          status?: string
          summary_docx_url?: string | null
          summary_pdf_url?: string | null
          tenant_id?: string
          title?: string
          transcript_url?: string | null
          updated_at?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meetings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      slide_uploads: {
        Row: {
          created_at: string
          file_name: string
          file_size: number
          file_url: string
          id: string
          meeting_id: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_size: number
          file_url: string
          id?: string
          meeting_id: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_size?: number
          file_url?: string
          id?: string
          meeting_id?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "slide_uploads_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slide_uploads_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slide_uploads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      suggested_tasks: {
        Row: {
          assigned_user_id: string | null
          created_at: string
          description: string | null
          id: string
          meeting_id: string
          status: string
          suggested_role: string
          tenant_id: string
          title: string
        }
        Insert: {
          assigned_user_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          meeting_id: string
          status?: string
          suggested_role: string
          tenant_id: string
          title: string
        }
        Update: {
          assigned_user_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          meeting_id?: string
          status?: string
          suggested_role?: string
          tenant_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "suggested_tasks_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suggested_tasks_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suggested_tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          id: string
          logo_url: string | null
          name: string
          plan: string
          slug: string
          updated_at: string
          vat_number: string
        }
        Insert: {
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          plan?: string
          slug: string
          updated_at?: string
          vat_number: string
        }
        Update: {
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          plan?: string
          slug?: string
          updated_at?: string
          vat_number?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          board_role_id: string | null
          created_at: string
          email: string
          full_name: string
          functional_area_id: string | null
          id: string
          is_active: boolean
          job_title: string | null
          role: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          board_role_id?: string | null
          created_at?: string
          email: string
          full_name: string
          functional_area_id?: string | null
          id: string
          is_active?: boolean
          job_title?: string | null
          role: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          board_role_id?: string | null
          created_at?: string
          email?: string
          full_name?: string
          functional_area_id?: string | null
          id?: string
          is_active?: boolean
          job_title?: string | null
          role?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_board_role_id_fkey"
            columns: ["board_role_id"]
            isOneToOne: false
            referencedRelation: "board_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_functional_area_id_fkey"
            columns: ["functional_area_id"]
            isOneToOne: false
            referencedRelation: "functional_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_user_role: { Args: never; Returns: string }
      current_user_tenant_id: { Args: never; Returns: string }
      is_io_or_admin: { Args: never; Returns: boolean }
      is_superadmin: { Args: never; Returns: boolean }
      register_and_join_tenant: {
        Args: {
          p_email: string
          p_full_name: string
          p_tenant_id: string
          p_user_id: string
        }
        Returns: Json
      }
      register_with_new_tenant: {
        Args: {
          p_email: string
          p_full_name: string
          p_tenant_name: string
          p_user_id: string
          p_vat_number: string
        }
        Returns: Json
      }
      search_tenant_by_vat: {
        Args: { p_query: string }
        Returns: {
          id: string
          name: string
          vat_number: string
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
  public: {
    Enums: {},
  },
} as const
