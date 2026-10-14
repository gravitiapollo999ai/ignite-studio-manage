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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      business_profiles: {
        Row: {
          brand_colors: string | null
          business_email: string | null
          business_name: string | null
          city: string | null
          completed: boolean
          country: string | null
          created_at: string
          description: string | null
          facebook: string | null
          industry: string | null
          instagram: string | null
          logo_path: string | null
          phone: string | null
          products_services: string | null
          target_audience: string | null
          tiktok: string | null
          updated_at: string
          user_id: string
          website: string | null
          youtube: string | null
        }
        Insert: {
          brand_colors?: string | null
          business_email?: string | null
          business_name?: string | null
          city?: string | null
          completed?: boolean
          country?: string | null
          created_at?: string
          description?: string | null
          facebook?: string | null
          industry?: string | null
          instagram?: string | null
          logo_path?: string | null
          phone?: string | null
          products_services?: string | null
          target_audience?: string | null
          tiktok?: string | null
          updated_at?: string
          user_id: string
          website?: string | null
          youtube?: string | null
        }
        Update: {
          brand_colors?: string | null
          business_email?: string | null
          business_name?: string | null
          city?: string | null
          completed?: boolean
          country?: string | null
          created_at?: string
          description?: string | null
          facebook?: string | null
          industry?: string | null
          instagram?: string | null
          logo_path?: string | null
          phone?: string | null
          products_services?: string | null
          target_audience?: string | null
          tiktok?: string | null
          updated_at?: string
          user_id?: string
          website?: string | null
          youtube?: string | null
        }
        Relationships: []
      }
      client_notes: {
        Row: {
          author_id: string | null
          client_id: string
          created_at: string
          id: string
          note: string
        }
        Insert: {
          author_id?: string | null
          client_id: string
          created_at?: string
          id?: string
          note: string
        }
        Update: {
          author_id?: string | null
          client_id?: string
          created_at?: string
          id?: string
          note?: string
        }
        Relationships: []
      }
      credit_ledger: {
        Row: {
          created_at: string
          created_by: string | null
          credit_request_id: string | null
          delta: number
          id: string
          job_id: string | null
          note: string | null
          reason: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          credit_request_id?: string | null
          delta: number
          id?: string
          job_id?: string | null
          note?: string | null
          reason: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          credit_request_id?: string | null
          delta?: number
          id?: string
          job_id?: string | null
          note?: string | null
          reason?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_ledger_credit_request_id_fkey"
            columns: ["credit_request_id"]
            isOneToOne: false
            referencedRelation: "credit_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_ledger_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_ledger_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs_feed"
            referencedColumns: ["job_id"]
          },
        ]
      }
      credit_requests: {
        Row: {
          admin_note: string | null
          client_message: string | null
          created_at: string
          credits: number
          decided_at: string | null
          decided_by: string | null
          id: string
          package_id: string | null
          payment_provider: string | null
          payment_reference: string | null
          status: string
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          client_message?: string | null
          created_at?: string
          credits: number
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          package_id?: string | null
          payment_provider?: string | null
          payment_reference?: string | null
          status?: string
          user_id: string
        }
        Update: {
          admin_note?: string | null
          client_message?: string | null
          created_at?: string
          credits?: number
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          package_id?: string | null
          payment_provider?: string | null
          payment_reference?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_requests_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      deliverables: {
        Row: {
          created_at: string
          file_name: string
          file_path: string
          id: string
          job_id: string
          try_number: number
        }
        Insert: {
          created_at?: string
          file_name: string
          file_path: string
          id?: string
          job_id: string
          try_number?: number
        }
        Update: {
          created_at?: string
          file_name?: string
          file_path?: string
          id?: string
          job_id?: string
          try_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "deliverables_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliverables_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs_feed"
            referencedColumns: ["job_id"]
          },
        ]
      }
      delivery_log: {
        Row: {
          actor: string
          content_sha256: string | null
          created_at: string
          http_status: number | null
          id: string
          job_id: string | null
          outcome: string
          size_bytes: number | null
          source: string
          try_number: number | null
        }
        Insert: {
          actor: string
          content_sha256?: string | null
          created_at?: string
          http_status?: number | null
          id?: string
          job_id?: string | null
          outcome: string
          size_bytes?: number | null
          source: string
          try_number?: number | null
        }
        Update: {
          actor?: string
          content_sha256?: string | null
          created_at?: string
          http_status?: number | null
          id?: string
          job_id?: string | null
          outcome?: string
          size_bytes?: number | null
          source?: string
          try_number?: number | null
        }
        Relationships: []
      }
      delivery_nonces: {
        Row: {
          created_at: string
          nonce: string
        }
        Insert: {
          created_at?: string
          nonce: string
        }
        Update: {
          created_at?: string
          nonce?: string
        }
        Relationships: []
      }
      delivery_requests: {
        Row: {
          actor: string
          attempts: number
          claimed_actor: string | null
          completed_at: string | null
          content_sha256: string
          created_at: string
          file_name: string | null
          file_path: string | null
          id: string
          job_id: string
          lease_token: string
          lease_until: string
          size_bytes: number
          source: string
          state: string
          try_number: number
        }
        Insert: {
          actor: string
          attempts?: number
          claimed_actor?: string | null
          completed_at?: string | null
          content_sha256: string
          created_at?: string
          file_name?: string | null
          file_path?: string | null
          id?: string
          job_id: string
          lease_token?: string
          lease_until: string
          size_bytes: number
          source: string
          state?: string
          try_number: number
        }
        Update: {
          actor?: string
          attempts?: number
          claimed_actor?: string | null
          completed_at?: string | null
          content_sha256?: string
          created_at?: string
          file_name?: string | null
          file_path?: string | null
          id?: string
          job_id?: string
          lease_token?: string
          lease_until?: string
          size_bytes?: number
          source?: string
          state?: string
          try_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "delivery_requests_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_requests_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs_feed"
            referencedColumns: ["job_id"]
          },
        ]
      }
      email_outbox: {
        Row: {
          attempts: number
          created_at: string
          id: string
          idempotency_key: string | null
          job_id: string
          lang: string
          last_error: string | null
          lease_token: string | null
          lease_until: string | null
          next_attempt_at: string
          sent_at: string | null
          status: string
          template: string
          try_number: number
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          id?: string
          idempotency_key?: string | null
          job_id: string
          lang?: string
          last_error?: string | null
          lease_token?: string | null
          lease_until?: string | null
          next_attempt_at?: string
          sent_at?: string | null
          status: string
          template: string
          try_number: number
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          id?: string
          idempotency_key?: string | null
          job_id?: string
          lang?: string
          last_error?: string | null
          lease_token?: string | null
          lease_until?: string | null
          next_attempt_at?: string
          sent_at?: string | null
          status?: string
          template?: string
          try_number?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_outbox_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_outbox_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs_feed"
            referencedColumns: ["job_id"]
          },
        ]
      }
      job_events: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          job_id: string
          message: string | null
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          job_id: string
          message?: string | null
          status: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          job_id?: string
          message?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs_feed"
            referencedColumns: ["job_id"]
          },
        ]
      }
      job_internal: {
        Row: {
          internal_notes: string | null
          internal_prompt: string | null
          job_id: string
          updated_at: string
        }
        Insert: {
          internal_notes?: string | null
          internal_prompt?: string | null
          job_id: string
          updated_at?: string
        }
        Update: {
          internal_notes?: string | null
          internal_prompt?: string | null
          job_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_internal_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_internal_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "jobs_feed"
            referencedColumns: ["job_id"]
          },
        ]
      }
      jobs: {
        Row: {
          business_type: string | null
          clip_end: number | null
          clip_start: number | null
          code: string
          created_at: string
          estimated_credits: number
          estimated_turnaround_hours: number
          id: string
          notes: string | null
          reference_image_path: string | null
          source_file_path: string | null
          source_type: string
          source_url: string | null
          status: string
          subject_name: string
          subject_type: string
          target_duration_seconds: number
          try_number: number
          updated_at: string
          user_id: string
        }
        Insert: {
          business_type?: string | null
          clip_end?: number | null
          clip_start?: number | null
          code?: string
          created_at?: string
          estimated_credits: number
          estimated_turnaround_hours: number
          id?: string
          notes?: string | null
          reference_image_path?: string | null
          source_file_path?: string | null
          source_type: string
          source_url?: string | null
          status?: string
          subject_name: string
          subject_type: string
          target_duration_seconds: number
          try_number?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          business_type?: string | null
          clip_end?: number | null
          clip_start?: number | null
          code?: string
          created_at?: string
          estimated_credits?: number
          estimated_turnaround_hours?: number
          id?: string
          notes?: string | null
          reference_image_path?: string | null
          source_file_path?: string | null
          source_type?: string
          source_url?: string | null
          status?: string
          subject_name?: string
          subject_type?: string
          target_duration_seconds?: number
          try_number?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      packages: {
        Row: {
          active: boolean
          created_at: string
          credits: number
          description: string | null
          id: string
          name: string
          price_label: string
          sort_order: number
          videos: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          credits: number
          description?: string | null
          id?: string
          name: string
          price_label?: string
          sort_order?: number
          videos: number
        }
        Update: {
          active?: boolean
          created_at?: string
          credits?: number
          description?: string | null
          id?: string
          name?: string
          price_label?: string
          sort_order?: number
          videos?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          company: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
        }
        Insert: {
          company?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
        }
        Update: {
          company?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
        }
        Relationships: []
      }
      settings: {
        Row: {
          accent_color: string
          brand_name: string
          credits_per_video: number
          default_turnaround_hours: number
          feed_last_success_at: string | null
          hf_credits_per_30s: number
          hf_plus_credits: number
          hf_plus_price: number
          hf_ultra_credits: number
          hf_ultra_price: number
          id: number
          logo_url: string | null
          max_tries_per_video: number
          max_video_seconds: number
          min_package_videos: number
          support_email: string
          updated_at: string
        }
        Insert: {
          accent_color?: string
          brand_name?: string
          credits_per_video?: number
          default_turnaround_hours?: number
          feed_last_success_at?: string | null
          hf_credits_per_30s?: number
          hf_plus_credits?: number
          hf_plus_price?: number
          hf_ultra_credits?: number
          hf_ultra_price?: number
          id?: number
          logo_url?: string | null
          max_tries_per_video?: number
          max_video_seconds?: number
          min_package_videos?: number
          support_email?: string
          updated_at?: string
        }
        Update: {
          accent_color?: string
          brand_name?: string
          credits_per_video?: number
          default_turnaround_hours?: number
          feed_last_success_at?: string | null
          hf_credits_per_30s?: number
          hf_plus_credits?: number
          hf_plus_price?: number
          hf_ultra_credits?: number
          hf_ultra_price?: number
          id?: number
          logo_url?: string | null
          max_tries_per_video?: number
          max_video_seconds?: number
          min_package_videos?: number
          support_email?: string
          updated_at?: string
        }
        Relationships: []
      }
      social_connections: {
        Row: {
          account_id: string | null
          account_name: string | null
          connected_at: string | null
          created_at: string
          id: string
          provider: string
          status: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          account_name?: string | null
          connected_at?: string | null
          created_at?: string
          id?: string
          provider: string
          status?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          account_name?: string | null
          connected_at?: string | null
          created_at?: string
          id?: string
          provider?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      social_posts: {
        Row: {
          created_at: string
          deliverable_id: string
          error: string | null
          external_post_id: string | null
          id: string
          provider: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deliverable_id: string
          error?: string | null
          external_post_id?: string | null
          id?: string
          provider: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deliverable_id?: string
          error?: string | null
          external_post_id?: string | null
          id?: string
          provider?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_posts_deliverable_id_fkey"
            columns: ["deliverable_id"]
            isOneToOne: false
            referencedRelation: "deliverables"
            referencedColumns: ["id"]
          },
        ]
      }
      social_tokens: {
        Row: {
          access_token: string | null
          connection_id: string
          expires_at: string | null
          refresh_token: string | null
          scopes: string | null
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          connection_id: string
          expires_at?: string | null
          refresh_token?: string | null
          scopes?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          connection_id?: string
          expires_at?: string | null
          refresh_token?: string | null
          scopes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_tokens_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: true
            referencedRelation: "social_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      source_video_checks: {
        Row: {
          checked_at: string
          duration_ms: number | null
          file_path: string
          ok: boolean
          user_id: string
        }
        Insert: {
          checked_at?: string
          duration_ms?: number | null
          file_path: string
          ok: boolean
          user_id: string
        }
        Update: {
          checked_at?: string
          duration_ms?: number | null
          file_path?: string
          ok?: boolean
          user_id?: string
        }
        Relationships: []
      }
      spoofer_sync: {
        Row: {
          attempts: number
          created_at: string
          job_id: string
          last_error: string | null
          next_attempt_at: string
          remote_job_id: string | null
          remote_status: string | null
          state: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          job_id: string
          last_error?: string | null
          next_attempt_at?: string
          remote_job_id?: string | null
          remote_status?: string | null
          state?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          job_id?: string
          last_error?: string | null
          next_attempt_at?: string
          remote_job_id?: string | null
          remote_status?: string | null
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "spoofer_sync_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spoofer_sync_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "jobs_feed"
            referencedColumns: ["job_id"]
          },
        ]
      }
      spoofer_sync_log: {
        Row: {
          created_at: string
          direction: string
          event: string
          event_id: string | null
          http_status: number | null
          id: string
          job_id: string | null
          message: string | null
          ok: boolean
        }
        Insert: {
          created_at?: string
          direction: string
          event: string
          event_id?: string | null
          http_status?: number | null
          id?: string
          job_id?: string | null
          message?: string | null
          ok: boolean
        }
        Update: {
          created_at?: string
          direction?: string
          event?: string
          event_id?: string | null
          http_status?: number | null
          id?: string
          job_id?: string | null
          message?: string | null
          ok?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "spoofer_sync_log_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spoofer_sync_log_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs_feed"
            referencedColumns: ["job_id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      credit_balances: {
        Row: {
          balance: number | null
          user_id: string | null
        }
        Relationships: []
      }
      credit_transactions: {
        Row: {
          amount: number | null
          created_at: string | null
          created_by: string | null
          credit_request_id: string | null
          id: string | null
          job_id: string | null
          kind: string | null
          note: string | null
          user_id: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string | null
          created_by?: string | null
          credit_request_id?: string | null
          id?: string | null
          job_id?: string | null
          kind?: string | null
          note?: string | null
          user_id?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string | null
          created_by?: string | null
          credit_request_id?: string | null
          id?: string | null
          job_id?: string | null
          kind?: string | null
          note?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_ledger_credit_request_id_fkey"
            columns: ["credit_request_id"]
            isOneToOne: false
            referencedRelation: "credit_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_ledger_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_ledger_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs_feed"
            referencedColumns: ["job_id"]
          },
        ]
      }
      jobs_feed: {
        Row: {
          business_type: string | null
          clip_end: number | null
          clip_start: number | null
          code: string | null
          created_at: string | null
          job_id: string | null
          notes: string | null
          reference_image_path: string | null
          source_file_path: string | null
          source_type: string | null
          source_url: string | null
          status: string | null
          subject_name: string | null
          subject_type: string | null
          target_duration_seconds: number | null
          try_number: number | null
          updated_at: string | null
        }
        Insert: {
          business_type?: string | null
          clip_end?: number | null
          clip_start?: number | null
          code?: string | null
          created_at?: string | null
          job_id?: string | null
          notes?: string | null
          reference_image_path?: string | null
          source_file_path?: string | null
          source_type?: string | null
          source_url?: string | null
          status?: string | null
          subject_name?: string | null
          subject_type?: string | null
          target_duration_seconds?: number | null
          try_number?: number | null
          updated_at?: string | null
        }
        Update: {
          business_type?: string | null
          clip_end?: number | null
          clip_start?: number | null
          code?: string | null
          created_at?: string | null
          job_id?: string | null
          notes?: string | null
          reference_image_path?: string | null
          source_file_path?: string | null
          source_type?: string | null
          source_url?: string | null
          status?: string | null
          subject_name?: string | null
          subject_type?: string | null
          target_duration_seconds?: number | null
          try_number?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_adjust_credits: {
        Args: { _delta: number; _note: string; _user_id: string }
        Returns: undefined
      }
      admin_queue_spoofer_sync: {
        Args: { _job_id: string }
        Returns: undefined
      }
      apply_spoofer_callback: {
        Args: {
          _event_id: string
          _file_name: string
          _file_path: string
          _job_id: string
          _message: string
          _remote_job_id: string
          _status: string
          _try_number: number
        }
        Returns: string
      }
      approve_credit_request: {
        Args: { _id: string; _note?: string }
        Returns: undefined
      }
      claim_delivery_nonce: { Args: { _nonce: string }; Returns: boolean }
      claim_email_outbox: {
        Args: { _limit: number }
        Returns: {
          id: string
          idempotency_key: string
          job_id: string
          lang: string
          lease_token: string
          template: string
          try_number: number
          user_id: string
        }[]
      }
      complete_delivery: {
        Args: {
          _email_status: string
          _file_name: string
          _file_path: string
          _lease_token: string
          _request_id: string
          _sha: string
          _size: number
        }
        Returns: string
      }
      create_job: {
        Args: {
          _business_type: string
          _clip_end: number
          _clip_start: number
          _notes: string
          _reference_image_path: string
          _source_file_path: string
          _source_type: string
          _source_url: string
          _subject_name: string
          _subject_type: string
          _target_duration_seconds: number
        }
        Returns: string
      }
      finish_email_outbox: {
        Args: {
          _error: string
          _id: string
          _lease_token: string
          _result: string
        }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      refund_job: {
        Args: { _credits: number; _job_id: string; _note: string }
        Returns: undefined
      }
      reject_credit_request: {
        Args: { _id: string; _note: string }
        Returns: undefined
      }
      request_revision: {
        Args: { _job_id: string; _reason: string }
        Returns: undefined
      }
      requeue_blocked_emails: { Args: never; Returns: number }
      reserve_delivery: {
        Args: {
          _actor: string
          _claimed_actor: string
          _job_id: string
          _sha: string
          _size: number
          _source: string
          _try_number: number
        }
        Returns: Json
      }
      set_job_status: {
        Args: { _job_id: string; _message: string; _status: string }
        Returns: undefined
      }
      set_user_role: {
        Args: { _grant: boolean; _role: string; _user_id: string }
        Returns: undefined
      }
      spoofer_status_rank: { Args: { _s: string }; Returns: number }
    }
    Enums: {
      app_role: "admin" | "client" | "manager"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "client", "manager"],
    },
  },
} as const
