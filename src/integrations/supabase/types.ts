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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json
          id: string
          product_id: string | null
          product_name: string | null
          product_type: string | null
          reason: string | null
          target_user_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          product_id?: string | null
          product_name?: string | null
          product_type?: string | null
          reason?: string | null
          target_user_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          product_id?: string | null
          product_name?: string | null
          product_type?: string | null
          reason?: string | null
          target_user_id?: string | null
        }
        Relationships: []
      }
      admin_permissions: {
        Row: {
          can_access: boolean | null
          created_at: string | null
          id: string
          module: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          can_access?: boolean | null
          created_at?: string | null
          id?: string
          module: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          can_access?: boolean | null
          created_at?: string | null
          id?: string
          module?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_permissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_custom_commissions: {
        Row: {
          affiliate_id: string
          commission_rate: number
          course_id: string
          created_at: string | null
          id: string
        }
        Insert: {
          affiliate_id: string
          commission_rate: number
          course_id: string
          created_at?: string | null
          id?: string
        }
        Update: {
          affiliate_id?: string
          commission_rate?: number
          course_id?: string
          created_at?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_custom_commissions_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_links: {
        Row: {
          affiliate_id: string
          clicks: number
          code: string
          course_id: string | null
          created_at: string
          id: string
        }
        Insert: {
          affiliate_id: string
          clicks?: number
          code: string
          course_id?: string | null
          created_at?: string
          id?: string
        }
        Update: {
          affiliate_id?: string
          clicks?: number
          code?: string
          course_id?: string | null
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_links_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_links_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_materials: {
        Row: {
          category: string
          created_at: string | null
          description: string | null
          file_url: string
          id: string
          thumbnail_url: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          category?: string
          created_at?: string | null
          description?: string | null
          file_url: string
          id?: string
          thumbnail_url?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          description?: string | null
          file_url?: string
          id?: string
          thumbnail_url?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      affiliate_sales: {
        Row: {
          affiliate_id: string | null
          amount: number
          commission: number
          course_id: string | null
          created_at: string
          id: string
          metadata: Json | null
          status: Database["public"]["Enums"]["affiliate_sale_status"]
        }
        Insert: {
          affiliate_id?: string | null
          amount: number
          commission: number
          course_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          status?: Database["public"]["Enums"]["affiliate_sale_status"]
        }
        Update: {
          affiliate_id?: string | null
          amount?: number
          commission?: number
          course_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          status?: Database["public"]["Enums"]["affiliate_sale_status"]
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_sales_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_sales_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliates: {
        Row: {
          balance: number
          bank_info: Json | null
          commission_rate: number
          created_at: string
          id: string
          pix_key: string | null
          referrer_id: string | null
          status: Database["public"]["Enums"]["affiliate_status"]
          total_earnings: number
          updated_at: string
        }
        Insert: {
          balance?: number
          bank_info?: Json | null
          commission_rate?: number
          created_at?: string
          id: string
          pix_key?: string | null
          referrer_id?: string | null
          status?: Database["public"]["Enums"]["affiliate_status"]
          total_earnings?: number
          updated_at?: string
        }
        Update: {
          balance?: number
          bank_info?: Json | null
          commission_rate?: number
          created_at?: string
          id?: string
          pix_key?: string | null
          referrer_id?: string | null
          status?: Database["public"]["Enums"]["affiliate_status"]
          total_earnings?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliates_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliates_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
        ]
      }
      asaas_transfers: {
        Row: {
          amount: number
          asaas_id: string | null
          created_at: string | null
          description: string | null
          id: string
          metadata: Json | null
          status: string
          transaction_type: string | null
          transfer_date: string
          updated_at: string | null
        }
        Insert: {
          amount: number
          asaas_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
          status: string
          transaction_type?: string | null
          transfer_date?: string
          updated_at?: string | null
        }
        Update: {
          amount?: number
          asaas_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
          status?: string
          transaction_type?: string | null
          transfer_date?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      asaas_webhook_events: {
        Row: {
          claim_token: string | null
          claimed_at: string | null
          event_id: string
          event_type: string
          last_error: string | null
          payload: Json | null
          payment_id: string
          processed_at: string | null
          status: string
        }
        Insert: {
          claim_token?: string | null
          claimed_at?: string | null
          event_id: string
          event_type: string
          last_error?: string | null
          payload?: Json | null
          payment_id: string
          processed_at?: string | null
          status?: string
        }
        Update: {
          claim_token?: string | null
          claimed_at?: string | null
          event_id?: string
          event_type?: string
          last_error?: string | null
          payload?: Json | null
          payment_id?: string
          processed_at?: string | null
          status?: string
        }
        Relationships: []
      }
      campaign_winners: {
        Row: {
          campaign_id: string | null
          created_at: string | null
          id: string
          points_at_time: number
          position: number
          user_id: string | null
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string | null
          id?: string
          points_at_time: number
          position: number
          user_id?: string | null
        }
        Update: {
          campaign_id?: string | null
          created_at?: string | null
          id?: string
          points_at_time?: number
          position?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_winners_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "ranking_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      certificate_templates: {
        Row: {
          background_url: string | null
          created_at: string | null
          css_content: string | null
          description: string | null
          html_content: string | null
          id: string
          is_active: boolean | null
          is_default: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          background_url?: string | null
          created_at?: string | null
          css_content?: string | null
          description?: string | null
          html_content?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          background_url?: string | null
          created_at?: string | null
          css_content?: string | null
          description?: string | null
          html_content?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      certificates: {
        Row: {
          certificate_code: string
          city_of_issue: string | null
          content_id: string
          content_type: string
          created_at: string | null
          custom_data: Json | null
          id: string
          is_revoked: boolean | null
          issue_date: string | null
          revocation_reason: string | null
          revoked_at: string | null
          student_id: string
          template_id: string | null
        }
        Insert: {
          certificate_code: string
          city_of_issue?: string | null
          content_id: string
          content_type: string
          created_at?: string | null
          custom_data?: Json | null
          id?: string
          is_revoked?: boolean | null
          issue_date?: string | null
          revocation_reason?: string | null
          revoked_at?: string | null
          student_id: string
          template_id?: string | null
        }
        Update: {
          certificate_code?: string
          city_of_issue?: string | null
          content_id?: string
          content_type?: string
          created_at?: string | null
          custom_data?: Json | null
          id?: string
          is_revoked?: boolean | null
          issue_date?: string | null
          revocation_reason?: string | null
          revoked_at?: string | null
          student_id?: string
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "certificates_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "certificate_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      content_certificates: {
        Row: {
          city_of_issue: string | null
          content_id: string
          content_type: string
          created_at: string | null
          custom_text: string | null
          id: string
          is_enabled: boolean | null
          min_progress_percentage: number | null
          template_id: string | null
          updated_at: string | null
        }
        Insert: {
          city_of_issue?: string | null
          content_id: string
          content_type: string
          created_at?: string | null
          custom_text?: string | null
          id?: string
          is_enabled?: boolean | null
          min_progress_percentage?: number | null
          template_id?: string | null
          updated_at?: string | null
        }
        Update: {
          city_of_issue?: string | null
          content_id?: string
          content_type?: string
          created_at?: string | null
          custom_text?: string | null
          id?: string
          is_enabled?: boolean | null
          min_progress_percentage?: number | null
          template_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_certificates_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "certificate_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      content_notifications: {
        Row: {
          content_id: string
          content_type: string
          created_at: string
          created_by: string | null
          id: string
          recipients_count: number
          sent_count: number
          title: string
        }
        Insert: {
          content_id: string
          content_type: string
          created_at?: string
          created_by?: string | null
          id?: string
          recipients_count?: number
          sent_count?: number
          title: string
        }
        Update: {
          content_id?: string
          content_type?: string
          created_at?: string
          created_by?: string | null
          id?: string
          recipients_count?: number
          sent_count?: number
          title?: string
        }
        Relationships: []
      }
      coupon_products: {
        Row: {
          coupon_id: string
          created_at: string
          id: string
          product_id: string
          product_type: string
        }
        Insert: {
          coupon_id: string
          created_at?: string
          id?: string
          product_id: string
          product_type?: string
        }
        Update: {
          coupon_id?: string
          created_at?: string
          id?: string
          product_id?: string
          product_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_products_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_redemptions: {
        Row: {
          completed_at: string | null
          context: string
          coupon_id: string
          created_at: string
          discount_amount: number
          final_amount: number
          id: string
          metadata: Json
          original_amount: number
          product_id: string | null
          product_type: string | null
          status: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          context?: string
          coupon_id: string
          created_at?: string
          discount_amount?: number
          final_amount?: number
          id?: string
          metadata?: Json
          original_amount?: number
          product_id?: string | null
          product_type?: string | null
          status?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          context?: string
          coupon_id?: string
          created_at?: string
          discount_amount?: number
          final_amount?: number
          id?: string
          metadata?: Json
          original_amount?: number
          product_id?: string | null
          product_type?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_redemptions_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          allowed_contexts: string[]
          applies_to_all: boolean
          auto_apply: boolean
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          discount_type: string
          discount_value: number
          expires_at: string | null
          id: string
          is_active: boolean
          max_uses: number | null
          max_uses_per_user: number | null
          min_purchase_amount: number | null
          name: string
          starts_at: string | null
          times_used: number
          updated_at: string
        }
        Insert: {
          allowed_contexts?: string[]
          applies_to_all?: boolean
          auto_apply?: boolean
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          discount_type?: string
          discount_value?: number
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          max_uses_per_user?: number | null
          min_purchase_amount?: number | null
          name: string
          starts_at?: string | null
          times_used?: number
          updated_at?: string
        }
        Update: {
          allowed_contexts?: string[]
          applies_to_all?: boolean
          auto_apply?: boolean
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          discount_type?: string
          discount_value?: number
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          max_uses_per_user?: number | null
          min_purchase_amount?: number | null
          name?: string
          starts_at?: string | null
          times_used?: number
          updated_at?: string
        }
        Relationships: []
      }
      course_enrollments: {
        Row: {
          course_id: string
          created_at: string | null
          id: string
          user_id: string
        }
        Insert: {
          course_id: string
          created_at?: string | null
          id?: string
          user_id: string
        }
        Update: {
          course_id?: string
          created_at?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_enrollments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_feedback: {
        Row: {
          admin_reply: string | null
          comment: string | null
          course_id: string | null
          created_at: string
          ebook_id: string | null
          id: string
          rating: number
          status: string
          updated_at: string
          user_id: string
          video_url: string | null
        }
        Insert: {
          admin_reply?: string | null
          comment?: string | null
          course_id?: string | null
          created_at?: string
          ebook_id?: string | null
          id?: string
          rating: number
          status?: string
          updated_at?: string
          user_id: string
          video_url?: string | null
        }
        Update: {
          admin_reply?: string | null
          comment?: string | null
          course_id?: string | null
          created_at?: string
          ebook_id?: string | null
          id?: string
          rating?: number
          status?: string
          updated_at?: string
          user_id?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "course_feedback_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_feedback_ebook_id_fkey"
            columns: ["ebook_id"]
            isOneToOne: false
            referencedRelation: "ebooks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      course_lessons: {
        Row: {
          content: string | null
          created_at: string | null
          description: string | null
          duration_minutes: number | null
          id: string
          is_free: boolean | null
          module_id: string
          order_index: number | null
          slug: string
          title: string
          updated_at: string | null
          video_url: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          is_free?: boolean | null
          module_id: string
          order_index?: number | null
          slug: string
          title: string
          updated_at?: string | null
          video_url?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          is_free?: boolean | null
          module_id?: string
          order_index?: number | null
          slug?: string
          title?: string
          updated_at?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "course_lessons_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "course_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      course_modules: {
        Row: {
          course_id: string
          created_at: string | null
          description: string | null
          id: string
          order_index: number | null
          title: string
          video_url: string | null
        }
        Insert: {
          course_id: string
          created_at?: string | null
          description?: string | null
          id?: string
          order_index?: number | null
          title: string
          video_url?: string | null
        }
        Update: {
          course_id?: string
          created_at?: string | null
          description?: string | null
          id?: string
          order_index?: number | null
          title?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "course_modules_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          badge: string | null
          checkpoints: Json | null
          content_url: string | null
          cover_url: string | null
          created_at: string
          description: string | null
          due_days: number | null
          id: string
          intro_video_url: string | null
          is_ai_generated: boolean | null
          is_locked: boolean | null
          level: string | null
          order_index: number | null
          payment_type: string | null
          price: number | null
          slug: string | null
          status: string | null
          teacher_name: string | null
          title: string
          updated_at: string
          workload_extras: Json
          workload_hours: number | null
        }
        Insert: {
          badge?: string | null
          checkpoints?: Json | null
          content_url?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          due_days?: number | null
          id: string
          intro_video_url?: string | null
          is_ai_generated?: boolean | null
          is_locked?: boolean | null
          level?: string | null
          order_index?: number | null
          payment_type?: string | null
          price?: number | null
          slug?: string | null
          status?: string | null
          teacher_name?: string | null
          title: string
          updated_at?: string
          workload_extras?: Json
          workload_hours?: number | null
        }
        Update: {
          badge?: string | null
          checkpoints?: Json | null
          content_url?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          due_days?: number | null
          id?: string
          intro_video_url?: string | null
          is_ai_generated?: boolean | null
          is_locked?: boolean | null
          level?: string | null
          order_index?: number | null
          payment_type?: string | null
          price?: number | null
          slug?: string | null
          status?: string | null
          teacher_name?: string | null
          title?: string
          updated_at?: string
          workload_extras?: Json
          workload_hours?: number | null
        }
        Relationships: []
      }
      ebook_chapters: {
        Row: {
          content: string | null
          created_at: string | null
          ebook_id: string
          id: string
          module_id: string | null
          order_index: number
          reading_minutes: number | null
          slug: string | null
          title: string
          video_url: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string | null
          ebook_id: string
          id?: string
          module_id?: string | null
          order_index?: number
          reading_minutes?: number | null
          slug?: string | null
          title: string
          video_url?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string | null
          ebook_id?: string
          id?: string
          module_id?: string | null
          order_index?: number
          reading_minutes?: number | null
          slug?: string | null
          title?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ebook_chapters_ebook_id_fkey"
            columns: ["ebook_id"]
            isOneToOne: false
            referencedRelation: "ebooks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ebook_chapters_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "ebook_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      ebook_download_logs: {
        Row: {
          accepted_at: string
          accepted_terms: boolean
          created_at: string
          ebook_id: string
          ebook_title: string | null
          id: string
          ip_address: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          accepted_at?: string
          accepted_terms?: boolean
          created_at?: string
          ebook_id: string
          ebook_title?: string | null
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          accepted_at?: string
          accepted_terms?: boolean
          created_at?: string
          ebook_id?: string
          ebook_title?: string | null
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      ebook_enrollments: {
        Row: {
          created_at: string
          ebook_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          ebook_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          ebook_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ebook_enrollments_ebook_id_fkey"
            columns: ["ebook_id"]
            isOneToOne: false
            referencedRelation: "ebooks"
            referencedColumns: ["id"]
          },
        ]
      }
      ebook_modules: {
        Row: {
          created_at: string | null
          description: string | null
          ebook_id: string
          id: string
          order_index: number
          title: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          ebook_id: string
          id?: string
          order_index?: number
          title: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          ebook_id?: string
          id?: string
          order_index?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "ebook_modules_ebook_id_fkey"
            columns: ["ebook_id"]
            isOneToOne: false
            referencedRelation: "ebooks"
            referencedColumns: ["id"]
          },
        ]
      }
      ebook_progress: {
        Row: {
          chapter_id: string
          completed_at: string | null
          id: string
          last_read_at: string | null
          user_id: string
        }
        Insert: {
          chapter_id: string
          completed_at?: string | null
          id?: string
          last_read_at?: string | null
          user_id: string
        }
        Update: {
          chapter_id?: string
          completed_at?: string | null
          id?: string
          last_read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ebook_progress_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "ebook_chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      ebooks: {
        Row: {
          badge: string | null
          category: string | null
          checkpoints: Json | null
          content_url: string | null
          course_id: string | null
          cover: string | null
          cover_url: string | null
          created_at: string | null
          description: string | null
          due_days: number | null
          id: string
          is_ai_generated: boolean | null
          is_locked: boolean | null
          keywords: string[] | null
          opening_video_url: string | null
          original_price: number | null
          pages_count: number | null
          payment_type: string | null
          price: number | null
          status: string | null
          subtitle: string | null
          title: string
          updated_at: string | null
          video_url: string | null
          workload_extras: Json
          workload_hours: number | null
        }
        Insert: {
          badge?: string | null
          category?: string | null
          checkpoints?: Json | null
          content_url?: string | null
          course_id?: string | null
          cover?: string | null
          cover_url?: string | null
          created_at?: string | null
          description?: string | null
          due_days?: number | null
          id?: string
          is_ai_generated?: boolean | null
          is_locked?: boolean | null
          keywords?: string[] | null
          opening_video_url?: string | null
          original_price?: number | null
          pages_count?: number | null
          payment_type?: string | null
          price?: number | null
          status?: string | null
          subtitle?: string | null
          title: string
          updated_at?: string | null
          video_url?: string | null
          workload_extras?: Json
          workload_hours?: number | null
        }
        Update: {
          badge?: string | null
          category?: string | null
          checkpoints?: Json | null
          content_url?: string | null
          course_id?: string | null
          cover?: string | null
          cover_url?: string | null
          created_at?: string | null
          description?: string | null
          due_days?: number | null
          id?: string
          is_ai_generated?: boolean | null
          is_locked?: boolean | null
          keywords?: string[] | null
          opening_video_url?: string | null
          original_price?: number | null
          pages_count?: number | null
          payment_type?: string | null
          price?: number | null
          status?: string | null
          subtitle?: string | null
          title?: string
          updated_at?: string | null
          video_url?: string | null
          workload_extras?: Json
          workload_hours?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ebooks_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      email_logs: {
        Row: {
          attempts: number
          created_at: string | null
          error_message: string | null
          id: string
          idempotency_key: string | null
          next_retry_at: string | null
          payload: Json | null
          provider_message_id: string | null
          recipient_email: string
          resolved_at: string | null
          retry_payload: Json | null
          sent_at: string | null
          status: string
          template_name: string
        }
        Insert: {
          attempts?: number
          created_at?: string | null
          error_message?: string | null
          id?: string
          idempotency_key?: string | null
          next_retry_at?: string | null
          payload?: Json | null
          provider_message_id?: string | null
          recipient_email: string
          resolved_at?: string | null
          retry_payload?: Json | null
          sent_at?: string | null
          status?: string
          template_name: string
        }
        Update: {
          attempts?: number
          created_at?: string | null
          error_message?: string | null
          id?: string
          idempotency_key?: string | null
          next_retry_at?: string | null
          payload?: Json | null
          provider_message_id?: string | null
          recipient_email?: string
          resolved_at?: string | null
          retry_payload?: Json | null
          sent_at?: string | null
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_settings: {
        Row: {
          created_at: string | null
          from_email: string
          from_name: string
          id: string
          is_enabled: boolean | null
          last_validation_at: string | null
          reply_to: string | null
          updated_at: string | null
          validation_error: string | null
          validation_status: string | null
        }
        Insert: {
          created_at?: string | null
          from_email?: string
          from_name?: string
          id?: string
          is_enabled?: boolean | null
          last_validation_at?: string | null
          reply_to?: string | null
          updated_at?: string | null
          validation_error?: string | null
          validation_status?: string | null
        }
        Update: {
          created_at?: string | null
          from_email?: string
          from_name?: string
          id?: string
          is_enabled?: boolean | null
          last_validation_at?: string | null
          reply_to?: string | null
          updated_at?: string | null
          validation_error?: string | null
          validation_status?: string | null
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          content_html: string
          content_text: string | null
          created_at: string | null
          description: string | null
          id: string
          name: string
          subject: string
          updated_at: string | null
          variables: Json | null
        }
        Insert: {
          content_html: string
          content_text?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          subject: string
          updated_at?: string | null
          variables?: Json | null
        }
        Update: {
          content_html?: string
          content_text?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          subject?: string
          updated_at?: string | null
          variables?: Json | null
        }
        Relationships: []
      }
      email_templates_config: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          subject: string
          template_name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          subject: string
          template_name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          subject?: string
          template_name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      email_verifications: {
        Row: {
          code: string
          consumed_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          user_id: string
        }
        Insert: {
          code: string
          consumed_at?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          user_id: string
        }
        Update: {
          code?: string
          consumed_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      financial_costs: {
        Row: {
          created_at: string
          id: string
          label: string
          updated_at: string
          value: number
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          updated_at?: string
          value?: number
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          updated_at?: string
          value?: number
        }
        Relationships: []
      }
      financial_partners: {
        Row: {
          created_at: string
          id: string
          name: string
          percent: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          percent?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          percent?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      financial_settings: {
        Row: {
          id: string
          manual_revenue: number | null
          total_revenue: number | null
          updated_at: string
        }
        Insert: {
          id?: string
          manual_revenue?: number | null
          total_revenue?: number | null
          updated_at?: string
        }
        Update: {
          id?: string
          manual_revenue?: number | null
          total_revenue?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      integration_logs: {
        Row: {
          created_at: string | null
          details: Json | null
          endpoint: string | null
          environment: string | null
          http_code: number | null
          id: string
          integration_name: string
          latency: string | null
          message: string | null
          response_body: Json | null
          status: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          details?: Json | null
          endpoint?: string | null
          environment?: string | null
          http_code?: number | null
          id?: string
          integration_name: string
          latency?: string | null
          message?: string | null
          response_body?: Json | null
          status: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          details?: Json | null
          endpoint?: string | null
          environment?: string | null
          http_code?: number | null
          id?: string
          integration_name?: string
          latency?: string | null
          message?: string | null
          response_body?: Json | null
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
      integrations: {
        Row: {
          category: string
          created_at: string | null
          credentials: Json
          id: string
          name: string
          settings: Json
          status: boolean | null
          type: Database["public"]["Enums"]["integration_type"]
          updated_at: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          credentials?: Json
          id?: string
          name: string
          settings?: Json
          status?: boolean | null
          type: Database["public"]["Enums"]["integration_type"]
          updated_at?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          credentials?: Json
          id?: string
          name?: string
          settings?: Json
          status?: boolean | null
          type?: Database["public"]["Enums"]["integration_type"]
          updated_at?: string | null
        }
        Relationships: []
      }
      knowledge_base: {
        Row: {
          category: Database["public"]["Enums"]["knowledge_category"]
          content: string
          created_at: string | null
          id: string
          keywords: string[] | null
          questions: string[] | null
          status: string
          title: string
          updated_at: string | null
        }
        Insert: {
          category?: Database["public"]["Enums"]["knowledge_category"]
          content: string
          created_at?: string | null
          id?: string
          keywords?: string[] | null
          questions?: string[] | null
          status?: string
          title: string
          updated_at?: string | null
        }
        Update: {
          category?: Database["public"]["Enums"]["knowledge_category"]
          content?: string
          created_at?: string | null
          id?: string
          keywords?: string[] | null
          questions?: string[] | null
          status?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      knowledge_feedback: {
        Row: {
          created_at: string | null
          id: string
          is_positive: boolean
          knowledge_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_positive: boolean
          knowledge_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_positive?: boolean
          knowledge_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_feedback_knowledge_id_fkey"
            columns: ["knowledge_id"]
            isOneToOne: false
            referencedRelation: "knowledge_base"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string | null
          phone: string | null
          source: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          name?: string | null
          phone?: string | null
          source?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string | null
          phone?: string | null
          source?: string | null
        }
        Relationships: []
      }
      lesson_progress: {
        Row: {
          id: string
          is_completed: boolean | null
          last_position_seconds: number | null
          lesson_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          id?: string
          is_completed?: boolean | null
          last_position_seconds?: number | null
          lesson_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          id?: string
          is_completed?: boolean | null
          last_position_seconds?: number | null
          lesson_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lesson_progress_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "course_lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      live_classes: {
        Row: {
          cover_url: string | null
          created_at: string | null
          description: string | null
          id: string
          link: string | null
          materials_url: string | null
          scheduled_at: string
          status: Database["public"]["Enums"]["live_class_status"] | null
          title: string
        }
        Insert: {
          cover_url?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          link?: string | null
          materials_url?: string | null
          scheduled_at: string
          status?: Database["public"]["Enums"]["live_class_status"] | null
          title: string
        }
        Update: {
          cover_url?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          link?: string | null
          materials_url?: string | null
          scheduled_at?: string
          status?: Database["public"]["Enums"]["live_class_status"] | null
          title?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          message: string
          metadata: Json | null
          sent_by: string | null
          target_type: string
          title: string
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          metadata?: Json | null
          sent_by?: string | null
          target_type: string
          title: string
          type: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          metadata?: Json | null
          sent_by?: string | null
          target_type?: string
          title?: string
          type?: string
        }
        Relationships: []
      }
      ops_alerts: {
        Row: {
          created_at: string
          dedup_key: string
          details: Json
          id: string
          message: string
          notified_at: string | null
          resolved_at: string | null
          severity: string
          status: string
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          dedup_key: string
          details?: Json
          id?: string
          message: string
          notified_at?: string | null
          resolved_at?: string | null
          severity?: string
          status?: string
          title: string
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          dedup_key?: string
          details?: Json
          id?: string
          message?: string
          notified_at?: string | null
          resolved_at?: string | null
          severity?: string
          status?: string
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      ops_job_runs: {
        Row: {
          job: string
          last_error: string | null
          last_run_at: string | null
          last_status: string | null
          locked_until: string | null
          pause_reason: string | null
          paused: boolean
          updated_at: string
        }
        Insert: {
          job: string
          last_error?: string | null
          last_run_at?: string | null
          last_status?: string | null
          locked_until?: string | null
          pause_reason?: string | null
          paused?: boolean
          updated_at?: string
        }
        Update: {
          job?: string
          last_error?: string | null
          last_run_at?: string | null
          last_status?: string | null
          locked_until?: string | null
          pause_reason?: string | null
          paused?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      partner_balances: {
        Row: {
          balance: number
          id: string
          total_earned: number | null
          total_withdrawn: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          id?: string
          total_earned?: number | null
          total_withdrawn?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          id?: string
          total_earned?: number | null
          total_withdrawn?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      payment_reconciliations: {
        Row: {
          amount: number
          created_at: string
          customer_email: string | null
          customer_name: string | null
          details: Json
          external_id: string
          id: string
          issue: string
          last_attempt_at: string | null
          payment_status: string | null
          product_id: string | null
          product_type: string | null
          resolved_at: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount?: number
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          details?: Json
          external_id: string
          id?: string
          issue: string
          last_attempt_at?: string | null
          payment_status?: string | null
          product_id?: string | null
          product_type?: string | null
          resolved_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          details?: Json
          external_id?: string
          id?: string
          issue?: string
          last_attempt_at?: string | null
          payment_status?: string | null
          product_id?: string | null
          product_type?: string | null
          resolved_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          billing_type: string | null
          confirmed_at: string | null
          created_at: string | null
          customer_id: string | null
          external_id: string
          external_reference: string | null
          fee: number
          id: string
          metadata: Json | null
          net_amount: number
          status: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          amount: number
          billing_type?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          customer_id?: string | null
          external_id: string
          external_reference?: string | null
          fee: number
          id?: string
          metadata?: Json | null
          net_amount: number
          status: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          amount?: number
          billing_type?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          customer_id?: string | null
          external_id?: string
          external_reference?: string | null
          fee?: number
          id?: string
          metadata?: Json | null
          net_amount?: number
          status?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      payout_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json
          id: string
          payout_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          payout_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          payout_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payout_audit_log_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "payout_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_requests: {
        Row: {
          admin_notes: string | null
          amount: number
          asaas_payment_id: string | null
          created_at: string | null
          document_status: string
          document_uploaded_at: string | null
          document_url: string | null
          id: string
          ip_address: string | null
          metadata: Json | null
          method: string
          pix_key: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["payout_status"]
          updated_at: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          amount: number
          asaas_payment_id?: string | null
          created_at?: string | null
          document_status?: string
          document_uploaded_at?: string | null
          document_url?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          method: string
          pix_key?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["payout_status"]
          updated_at?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          amount?: number
          asaas_payment_id?: string | null
          created_at?: string | null
          document_status?: string
          document_uploaded_at?: string | null
          document_url?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          method?: string
          pix_key?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["payout_status"]
          updated_at?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payout_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_checkouts: {
        Row: {
          created_at: string | null
          id: string
          metadata: Json | null
          product_id: string
          product_type: string
          status: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          metadata?: Json | null
          product_id: string
          product_type: string
          status?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          metadata?: Json | null
          product_id?: string
          product_type?: string
          status?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      platform_materials: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          external_url: string | null
          file_url: string | null
          id: string
          is_active: boolean | null
          title: string
          type: string
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          external_url?: string | null
          file_url?: string | null
          id?: string
          is_active?: boolean | null
          title: string
          type: string
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          external_url?: string | null
          file_url?: string | null
          id?: string
          is_active?: boolean | null
          title?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          cpf: string | null
          created_at: string
          email: string | null
          email_notifications_opt_in: boolean | null
          email_verified_at: string | null
          id: string
          name: string | null
          phone: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          cpf?: string | null
          created_at?: string
          email?: string | null
          email_notifications_opt_in?: boolean | null
          email_verified_at?: string | null
          id: string
          name?: string | null
          phone?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          cpf?: string | null
          created_at?: string
          email?: string | null
          email_notifications_opt_in?: boolean | null
          email_verified_at?: string | null
          id?: string
          name?: string | null
          phone?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      progress_tracking: {
        Row: {
          completed_at: string | null
          id: string
          item_id: string
          item_type: string
          last_milestone: number | null
          points_awarded: number | null
          started_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          id?: string
          item_id: string
          item_type: string
          last_milestone?: number | null
          points_awarded?: number | null
          started_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          id?: string
          item_id?: string
          item_type?: string
          last_milestone?: number | null
          points_awarded?: number | null
          started_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ranking_campaigns: {
        Row: {
          created_at: string | null
          description: string | null
          end_date: string
          id: string
          is_active: boolean | null
          name: string
          prize_description: string
          rewarded_positions: number[]
          start_date: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          end_date: string
          id?: string
          is_active?: boolean | null
          name: string
          prize_description: string
          rewarded_positions: number[]
          start_date: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          end_date?: string
          id?: string
          is_active?: boolean | null
          name?: string
          prize_description?: string
          rewarded_positions?: number[]
          start_date?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      recipes: {
        Row: {
          category: string | null
          cost: string | null
          created_at: string
          difficulty: Database["public"]["Enums"]["difficulty_level"] | null
          id: string
          image_url: string | null
          ingredients: string[] | null
          is_published: boolean | null
          name: string
          prep_time: string | null
          profit_margin: string | null
          sell_price: string | null
          steps: string[] | null
          video_url: string | null
          yield: string | null
        }
        Insert: {
          category?: string | null
          cost?: string | null
          created_at?: string
          difficulty?: Database["public"]["Enums"]["difficulty_level"] | null
          id?: string
          image_url?: string | null
          ingredients?: string[] | null
          is_published?: boolean | null
          name: string
          prep_time?: string | null
          profit_margin?: string | null
          sell_price?: string | null
          steps?: string[] | null
          video_url?: string | null
          yield?: string | null
        }
        Update: {
          category?: string | null
          cost?: string | null
          created_at?: string
          difficulty?: Database["public"]["Enums"]["difficulty_level"] | null
          id?: string
          image_url?: string | null
          ingredients?: string[] | null
          is_published?: boolean | null
          name?: string
          prep_time?: string | null
          profit_margin?: string | null
          sell_price?: string | null
          steps?: string[] | null
          video_url?: string | null
          yield?: string | null
        }
        Relationships: []
      }
      report_logs: {
        Row: {
          created_at: string | null
          error: string | null
          id: string
          provider_message_id: string | null
          recipient_id: string | null
          report_date: string
          sent_at: string | null
          status: string
        }
        Insert: {
          created_at?: string | null
          error?: string | null
          id?: string
          provider_message_id?: string | null
          recipient_id?: string | null
          report_date: string
          sent_at?: string | null
          status: string
        }
        Update: {
          created_at?: string | null
          error?: string | null
          id?: string
          provider_message_id?: string | null
          recipient_id?: string | null
          report_date?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_logs_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "report_recipients"
            referencedColumns: ["id"]
          },
        ]
      }
      report_recipients: {
        Row: {
          active: boolean
          created_at: string
          email: string | null
          id: string
          name: string
          phone_e164: string | null
          report_types: string[]
        }
        Insert: {
          active?: boolean
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone_e164?: string | null
          report_types?: string[]
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone_e164?: string | null
          report_types?: string[]
        }
        Relationships: []
      }
      report_settings: {
        Row: {
          cron_token: string | null
          delivery_method: string | null
          enabled: boolean
          id: string
          recipients: string[] | null
          send_time: string
          send_when_no_activity: boolean
          timezone: string
          updated_at: string
        }
        Insert: {
          cron_token?: string | null
          delivery_method?: string | null
          enabled?: boolean
          id?: string
          recipients?: string[] | null
          send_time?: string
          send_when_no_activity?: boolean
          timezone?: string
          updated_at?: string
        }
        Update: {
          cron_token?: string | null
          delivery_method?: string | null
          enabled?: boolean
          id?: string
          recipients?: string[] | null
          send_time?: string
          send_when_no_activity?: boolean
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      support_messages: {
        Row: {
          created_at: string | null
          id: string
          message: string
          metadata: Json | null
          sender_id: string | null
          sender_type: Database["public"]["Enums"]["support_sender_type"]
          ticket_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          message: string
          metadata?: Json | null
          sender_id?: string | null
          sender_type: Database["public"]["Enums"]["support_sender_type"]
          ticket_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          message?: string
          metadata?: Json | null
          sender_id?: string | null
          sender_type?: Database["public"]["Enums"]["support_sender_type"]
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          assigned_to: string | null
          category: string | null
          closed_at: string | null
          created_at: string
          id: string
          legacy_message: string | null
          priority: string | null
          status: string | null
          subject: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          category?: string | null
          closed_at?: string | null
          created_at?: string
          id?: string
          legacy_message?: string | null
          priority?: string | null
          status?: string | null
          subject?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          category?: string | null
          closed_at?: string | null
          created_at?: string
          id?: string
          legacy_message?: string | null
          priority?: string | null
          status?: string | null
          subject?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      system_logs: {
        Row: {
          created_at: string
          details: Json | null
          id: string
          ip_address: string | null
          level: string
          message: string
          source: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          level: string
          message: string
          source: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          level?: string
          message?: string
          source?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      system_updates: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          impact: string
          released_at: string
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          impact?: string
          released_at?: string
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          impact?: string
          released_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      unhandled_questions: {
        Row: {
          confidence: number | null
          context: Json | null
          created_at: string | null
          id: string
          question: string
          status: string
          user_id: string | null
        }
        Insert: {
          confidence?: number | null
          context?: Json | null
          created_at?: string | null
          id?: string
          question: string
          status?: string
          user_id?: string | null
        }
        Update: {
          confidence?: number | null
          context?: Json | null
          created_at?: string | null
          id?: string
          question?: string
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
      update_report_logs: {
        Row: {
          created_at: string
          error: string | null
          id: string
          provider_message_id: string | null
          recipient_email: string | null
          recipient_id: string | null
          report_date: string
          status: string
          updates_count: number
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          provider_message_id?: string | null
          recipient_email?: string | null
          recipient_id?: string | null
          report_date: string
          status?: string
          updates_count?: number
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          provider_message_id?: string | null
          recipient_email?: string | null
          recipient_id?: string | null
          report_date?: string
          status?: string
          updates_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "update_report_logs_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "report_recipients"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notifications: {
        Row: {
          created_at: string
          id: string
          notification_id: string
          read_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notification_id: string
          read_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notification_id?: string
          read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_notifications_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      user_onboarding: {
        Row: {
          has_seen_onboarding: boolean | null
          last_seen_at: string | null
          user_id: string
        }
        Insert: {
          has_seen_onboarding?: boolean | null
          last_seen_at?: string | null
          user_id: string
        }
        Update: {
          has_seen_onboarding?: boolean | null
          last_seen_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_stats: {
        Row: {
          created_at: string
          level: number
          rank: number | null
          total_points: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          level?: number
          rank?: number | null
          total_points?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          level?: number
          rank?: number | null
          total_points?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_instances: {
        Row: {
          created_at: string
          id: string
          last_connected_at: string | null
          phone_number: string | null
          qr_code: string | null
          session_data: Json | null
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_connected_at?: string | null
          phone_number?: string | null
          qr_code?: string | null
          session_data?: Json | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_connected_at?: string | null
          phone_number?: string | null
          qr_code?: string | null
          session_data?: Json | null
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      acquire_asaas_webhook_claim: {
        Args: {
          p_event_id: string
          p_event_type: string
          p_lease_interval?: string
          p_payload: Json
          p_payment_id: string
        }
        Returns: {
          claim_token: string
          claimed_at: string
          status: string
        }[]
      }
      acquire_ops_job: {
        Args: { p_job: string; p_lease?: string }
        Returns: boolean
      }
      admin_request_payout_document: {
        Args: { p_notes?: string; p_payout_id: string }
        Returns: undefined
      }
      admin_set_payout_status: {
        Args: {
          p_notes?: string
          p_payout_id: string
          p_rejection_reason?: string
          p_status: Database["public"]["Enums"]["payout_status"]
        }
        Returns: Json
      }
      award_points: {
        Args: { p_points: number; p_user_id: string }
        Returns: undefined
      }
      cancel_payout: { Args: { p_payout_id: string }; Returns: undefined }
      complete_coupon_redemption: {
        Args: {
          p_product_id: string
          p_product_type: string
          p_user_id: string
        }
        Returns: undefined
      }
      complete_linked_course: {
        Args: { _ebook_id: string; _user_id: string }
        Returns: undefined
      }
      distribute_partner_profits: {
        Args: { p_amount: number; p_partner_id: string }
        Returns: undefined
      }
      enroll_free_ebook: { Args: { p_ebook_id: string }; Returns: boolean }
      finalize_ebook_completion: { Args: { _ebook_id: string }; Returns: Json }
      finish_ranking_campaign: {
        Args: { _campaign_id: string }
        Returns: undefined
      }
      get_student_ranking: {
        Args: { p_limit?: number }
        Returns: {
          avatar_url: string
          global_rank: number
          name: string
          total_points: number
          user_id: string
        }[]
      }
      get_student_ranking_v2: {
        Args: { p_end_date?: string; p_limit?: number; p_start_date?: string }
        Returns: {
          avatar_url: string
          global_rank: number
          name: string
          total_points: number
          user_id: string
        }[]
      }
      has_any_enrollment: { Args: { _user_id: string }; Returns: boolean }
      has_module_access: {
        Args: { _module: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_affiliate_earnings: {
        Args: { aff_id: string; amount_to_add: number }
        Returns: undefined
      }
      increment_partner_withdrawn: {
        Args: { p_amount: number; p_user_id: string }
        Returns: undefined
      }
      log_system_event: {
        Args: {
          _details?: Json
          _level: string
          _message: string
          _source: string
        }
        Returns: string
      }
      log_unhandled_question_v2: {
        Args: { p_confidence: number; p_context: Json; p_message: string }
        Returns: undefined
      }
      prune_system_logs: {
        Args: { p_max_age?: string; p_max_rows?: number }
        Returns: number
      }
      redeem_coupon: {
        Args: {
          p_amount: number
          p_code: string
          p_context?: string
          p_metadata?: Json
          p_product_id: string
          p_product_type: string
          p_user_id: string
        }
        Returns: Json
      }
      register_ebook_download: {
        Args: {
          p_accepted: boolean
          p_ebook_id: string
          p_ip?: string
          p_user_agent?: string
        }
        Returns: Json
      }
      request_payout_atomic: {
        Args: {
          p_amount: number
          p_document_url?: string
          p_ip?: string
          p_method: string
          p_pix_key: string
          p_user_agent?: string
          p_user_type: string
        }
        Returns: string
      }
      save_assistant_response: {
        Args: { p_content: string; p_ticket_id: string }
        Returns: undefined
      }
      trigger_daily_report: { Args: never; Returns: undefined }
      trigger_ops_recovery: { Args: never; Returns: undefined }
      update_expired_live_classes: { Args: never; Returns: undefined }
      validate_coupon: {
        Args: {
          p_amount?: number
          p_code: string
          p_context?: string
          p_product_id?: string
          p_product_type?: string
          p_user_id?: string
        }
        Returns: Json
      }
    }
    Enums: {
      affiliate_sale_status: "pending" | "paid" | "cancelled"
      affiliate_status: "pending" | "active" | "blocked"
      app_role: "admin" | "student" | "manager" | "agent"
      difficulty_level: "Fácil" | "Médio" | "Avançado"
      integration_type: "ia" | "payment" | "oauth"
      knowledge_category:
        | "CONTA"
        | "CURSOS"
        | "EBOOKS"
        | "MATERIAIS"
        | "PWA"
        | "SUPORTE"
        | "PROBLEMAS"
      live_class_status: "scheduled" | "live" | "completed"
      payout_status:
        | "pending"
        | "analyzing"
        | "approved"
        | "paid"
        | "rejected"
        | "cancelled"
      support_sender_type: "student" | "assistant" | "support_agent" | "system"
      support_ticket_status: "open" | "in_progress" | "resolved" | "closed"
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
      affiliate_sale_status: ["pending", "paid", "cancelled"],
      affiliate_status: ["pending", "active", "blocked"],
      app_role: ["admin", "student", "manager", "agent"],
      difficulty_level: ["Fácil", "Médio", "Avançado"],
      integration_type: ["ia", "payment", "oauth"],
      knowledge_category: [
        "CONTA",
        "CURSOS",
        "EBOOKS",
        "MATERIAIS",
        "PWA",
        "SUPORTE",
        "PROBLEMAS",
      ],
      live_class_status: ["scheduled", "live", "completed"],
      payout_status: [
        "pending",
        "analyzing",
        "approved",
        "paid",
        "rejected",
        "cancelled",
      ],
      support_sender_type: ["student", "assistant", "support_agent", "system"],
      support_ticket_status: ["open", "in_progress", "resolved", "closed"],
    },
  },
} as const
