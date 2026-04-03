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
      activity_logs: {
        Row: {
          action_category: string
          action_type: string
          created_at: string
          id: string
          ip_address: string | null
          is_suspicious: boolean | null
          metadata: Json | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action_category?: string
          action_type: string
          created_at?: string
          id?: string
          ip_address?: string | null
          is_suspicious?: boolean | null
          metadata?: Json | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action_category?: string
          action_type?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          is_suspicious?: boolean | null
          metadata?: Json | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      admin_codes: {
        Row: {
          code_hash: string
          code_name: string
          created_at: string
          expires_at: string | null
          id: string
          is_active: boolean
          last_used_at: string | null
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          code_hash: string
          code_name: string
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          role?: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          code_hash?: string
          code_name?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      admin_otp: {
        Row: {
          created_at: string | null
          expires_at: string
          id: string
          otp_code: string
          user_id: string
          verified: boolean | null
        }
        Insert: {
          created_at?: string | null
          expires_at: string
          id?: string
          otp_code: string
          user_id: string
          verified?: boolean | null
        }
        Update: {
          created_at?: string | null
          expires_at?: string
          id?: string
          otp_code?: string
          user_id?: string
          verified?: boolean | null
        }
        Relationships: []
      }
      agreement_payments: {
        Row: {
          agreement_id: string | null
          amount: number
          completed_at: string | null
          created_at: string
          currency: string
          id: string
          payment_method: string | null
          payment_type: string
          status: string
          transaction_ref: string | null
          user_id: string
        }
        Insert: {
          agreement_id?: string | null
          amount: number
          completed_at?: string | null
          created_at?: string
          currency?: string
          id?: string
          payment_method?: string | null
          payment_type?: string
          status?: string
          transaction_ref?: string | null
          user_id: string
        }
        Update: {
          agreement_id?: string | null
          amount?: number
          completed_at?: string | null
          created_at?: string
          currency?: string
          id?: string
          payment_method?: string | null
          payment_type?: string
          status?: string
          transaction_ref?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agreement_payments_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "debt_agreements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agreement_payments_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "debt_agreements_secure"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_rooms: {
        Row: {
          agreement_id: string | null
          created_at: string
          direct_chat_id: string | null
          has_pending_action: boolean
          id: string
          last_message: string | null
          last_message_at: string | null
          pending_action_for: string | null
          pending_action_type: Database["public"]["Enums"]["pending_action_type"]
          room_type: Database["public"]["Enums"]["chat_room_type"]
          unread_count_user1: number
          unread_count_user2: number
          updated_at: string
          user1_id: string
          user2_id: string
        }
        Insert: {
          agreement_id?: string | null
          created_at?: string
          direct_chat_id?: string | null
          has_pending_action?: boolean
          id?: string
          last_message?: string | null
          last_message_at?: string | null
          pending_action_for?: string | null
          pending_action_type?: Database["public"]["Enums"]["pending_action_type"]
          room_type?: Database["public"]["Enums"]["chat_room_type"]
          unread_count_user1?: number
          unread_count_user2?: number
          updated_at?: string
          user1_id: string
          user2_id: string
        }
        Update: {
          agreement_id?: string | null
          created_at?: string
          direct_chat_id?: string | null
          has_pending_action?: boolean
          id?: string
          last_message?: string | null
          last_message_at?: string | null
          pending_action_for?: string | null
          pending_action_type?: Database["public"]["Enums"]["pending_action_type"]
          room_type?: Database["public"]["Enums"]["chat_room_type"]
          unread_count_user1?: number
          unread_count_user2?: number
          updated_at?: string
          user1_id?: string
          user2_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_rooms_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: true
            referencedRelation: "debt_agreements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_rooms_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: true
            referencedRelation: "debt_agreements_secure"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_rooms_direct_chat_id_fkey"
            columns: ["direct_chat_id"]
            isOneToOne: true
            referencedRelation: "direct_chats"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_typing: {
        Row: {
          agreement_id: string | null
          direct_chat_id: string | null
          id: string
          is_typing: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          agreement_id?: string | null
          direct_chat_id?: string | null
          id?: string
          is_typing?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          agreement_id?: string | null
          direct_chat_id?: string | null
          id?: string
          is_typing?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_typing_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "debt_agreements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_typing_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "debt_agreements_secure"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_typing_direct_chat_id_fkey"
            columns: ["direct_chat_id"]
            isOneToOne: false
            referencedRelation: "direct_chats"
            referencedColumns: ["id"]
          },
        ]
      }
      debt_agreements: {
        Row: {
          account_name: string | null
          account_number: string | null
          agreement_text: string | null
          bank_name: string | null
          borrower_confirmed: boolean | null
          borrower_confirmed_device: string | null
          borrower_confirmed_ip: string | null
          borrower_confirmed_transfer: boolean | null
          borrower_confirmed_transfer_at: string | null
          borrower_id: string | null
          borrower_name: string | null
          borrower_phone: string | null
          created_at: string
          description: string | null
          frequency: string
          id: string
          interest_rate: number | null
          interest_type: string
          lender_confirmed: boolean | null
          lender_confirmed_device: string | null
          lender_confirmed_ip: string | null
          lender_id: string
          num_installments: number
          principal_amount: number
          reschedule_fee_rate: number | null
          reschedule_interest_multiplier: number | null
          start_date: string
          status: string
          total_amount: number
          transfer_slip_url: string | null
          transferred_at: string | null
          updated_at: string
        }
        Insert: {
          account_name?: string | null
          account_number?: string | null
          agreement_text?: string | null
          bank_name?: string | null
          borrower_confirmed?: boolean | null
          borrower_confirmed_device?: string | null
          borrower_confirmed_ip?: string | null
          borrower_confirmed_transfer?: boolean | null
          borrower_confirmed_transfer_at?: string | null
          borrower_id?: string | null
          borrower_name?: string | null
          borrower_phone?: string | null
          created_at?: string
          description?: string | null
          frequency?: string
          id?: string
          interest_rate?: number | null
          interest_type?: string
          lender_confirmed?: boolean | null
          lender_confirmed_device?: string | null
          lender_confirmed_ip?: string | null
          lender_id: string
          num_installments?: number
          principal_amount: number
          reschedule_fee_rate?: number | null
          reschedule_interest_multiplier?: number | null
          start_date: string
          status?: string
          total_amount: number
          transfer_slip_url?: string | null
          transferred_at?: string | null
          updated_at?: string
        }
        Update: {
          account_name?: string | null
          account_number?: string | null
          agreement_text?: string | null
          bank_name?: string | null
          borrower_confirmed?: boolean | null
          borrower_confirmed_device?: string | null
          borrower_confirmed_ip?: string | null
          borrower_confirmed_transfer?: boolean | null
          borrower_confirmed_transfer_at?: string | null
          borrower_id?: string | null
          borrower_name?: string | null
          borrower_phone?: string | null
          created_at?: string
          description?: string | null
          frequency?: string
          id?: string
          interest_rate?: number | null
          interest_type?: string
          lender_confirmed?: boolean | null
          lender_confirmed_device?: string | null
          lender_confirmed_ip?: string | null
          lender_id?: string
          num_installments?: number
          principal_amount?: number
          reschedule_fee_rate?: number | null
          reschedule_interest_multiplier?: number | null
          start_date?: string
          status?: string
          total_amount?: number
          transfer_slip_url?: string | null
          transferred_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      direct_chats: {
        Row: {
          created_at: string
          id: string
          updated_at: string
          user1_id: string
          user2_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          updated_at?: string
          user1_id: string
          user2_id: string
        }
        Update: {
          created_at?: string
          id?: string
          updated_at?: string
          user1_id?: string
          user2_id?: string
        }
        Relationships: []
      }
      engagement_badges: {
        Row: {
          badge_tier: number
          badge_type: string
          earned_at: string
          id: string
          user_id: string
        }
        Insert: {
          badge_tier?: number
          badge_type: string
          earned_at?: string
          id?: string
          user_id: string
        }
        Update: {
          badge_tier?: number
          badge_type?: string
          earned_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      friend_requests: {
        Row: {
          created_at: string
          from_user_id: string
          id: string
          status: string
          to_user_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          from_user_id: string
          id?: string
          status?: string
          to_user_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          from_user_id?: string
          id?: string
          status?: string
          to_user_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      friends: {
        Row: {
          created_at: string
          friend_name: string
          friend_phone: string | null
          friend_user_id: string | null
          id: string
          nickname: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          friend_name: string
          friend_phone?: string | null
          friend_user_id?: string | null
          id?: string
          nickname?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          friend_name?: string
          friend_phone?: string | null
          friend_user_id?: string | null
          id?: string
          nickname?: string | null
          user_id?: string
        }
        Relationships: []
      }
      installments: {
        Row: {
          agreement_id: string
          amount: number
          confirmed_by_lender: boolean | null
          created_at: string
          due_date: string
          id: string
          installment_number: number
          interest_portion: number | null
          original_due_date: string | null
          paid_at: string | null
          payment_proof_url: string | null
          principal_portion: number
          status: string
          updated_at: string
        }
        Insert: {
          agreement_id: string
          amount: number
          confirmed_by_lender?: boolean | null
          created_at?: string
          due_date: string
          id?: string
          installment_number: number
          interest_portion?: number | null
          original_due_date?: string | null
          paid_at?: string | null
          payment_proof_url?: string | null
          principal_portion: number
          status?: string
          updated_at?: string
        }
        Update: {
          agreement_id?: string
          amount?: number
          confirmed_by_lender?: boolean | null
          created_at?: string
          due_date?: string
          id?: string
          installment_number?: number
          interest_portion?: number | null
          original_due_date?: string | null
          paid_at?: string | null
          payment_proof_url?: string | null
          principal_portion?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "installments_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "debt_agreements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installments_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "debt_agreements_secure"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          agreement_id: string | null
          content: string
          created_at: string
          direct_chat_id: string | null
          file_name: string | null
          file_url: string | null
          id: string
          image_url: string | null
          read_at: string | null
          reply_to_id: string | null
          sender_id: string
          voice_duration: number | null
          voice_url: string | null
        }
        Insert: {
          agreement_id?: string | null
          content: string
          created_at?: string
          direct_chat_id?: string | null
          file_name?: string | null
          file_url?: string | null
          id?: string
          image_url?: string | null
          read_at?: string | null
          reply_to_id?: string | null
          sender_id: string
          voice_duration?: number | null
          voice_url?: string | null
        }
        Update: {
          agreement_id?: string | null
          content?: string
          created_at?: string
          direct_chat_id?: string | null
          file_name?: string | null
          file_url?: string | null
          id?: string
          image_url?: string | null
          read_at?: string | null
          reply_to_id?: string | null
          sender_id?: string
          voice_duration?: number | null
          voice_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "debt_agreements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "debt_agreements_secure"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_direct_chat_id_fkey"
            columns: ["direct_chat_id"]
            isOneToOne: false
            referencedRelation: "direct_chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          action_url: string | null
          created_at: string
          id: string
          is_read: boolean
          message: string
          priority: Database["public"]["Enums"]["notification_priority"]
          related_id: string | null
          related_type: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          action_url?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          priority?: Database["public"]["Enums"]["notification_priority"]
          related_id?: string | null
          related_type?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          action_url?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          priority?: Database["public"]["Enums"]["notification_priority"]
          related_id?: string | null
          related_type?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      point_redemptions: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          points_spent: number
          reward_type: string
          reward_value: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          points_spent: number
          reward_type: string
          reward_value?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          points_spent?: number
          reward_type?: string
          reward_value?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      point_transactions: {
        Row: {
          action_type: string
          created_at: string
          description: string | null
          id: string
          points: number
          reference_id: string | null
          user_id: string
        }
        Insert: {
          action_type: string
          created_at?: string
          description?: string | null
          id?: string
          points: number
          reference_id?: string | null
          user_id: string
        }
        Update: {
          action_type?: string
          created_at?: string
          description?: string | null
          id?: string
          points?: number
          reference_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          agreement_credits: number
          avatar_url: string | null
          created_at: string
          display_name: string | null
          first_name: string | null
          free_agreements_used: number
          id: string
          last_name: string | null
          pdpa_accepted_at: string | null
          phone: string | null
          theme_preference: string
          updated_at: string
          user_code: string | null
          user_id: string
        }
        Insert: {
          agreement_credits?: number
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          first_name?: string | null
          free_agreements_used?: number
          id?: string
          last_name?: string | null
          pdpa_accepted_at?: string | null
          phone?: string | null
          theme_preference?: string
          updated_at?: string
          user_code?: string | null
          user_id: string
        }
        Update: {
          agreement_credits?: number
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          first_name?: string | null
          free_agreements_used?: number
          id?: string
          last_name?: string | null
          pdpa_accepted_at?: string | null
          phone?: string | null
          theme_preference?: string
          updated_at?: string
          user_code?: string | null
          user_id?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_id?: string
        }
        Relationships: []
      }
      reschedule_requests: {
        Row: {
          agreement_id: string
          applied_fee_rate: number
          approved_at: string | null
          approved_by: string | null
          created_at: string
          custom_fee_rate: number | null
          fee_installments: number
          fee_per_installment: number
          id: string
          installment_id: string
          new_due_date: string
          original_due_date: string
          original_fee_rate: number
          rejection_reason: string | null
          requested_by: string
          reschedule_fee: number
          safeguard_applied: boolean
          slip_url: string | null
          status: string
          submitted_amount: number | null
          updated_at: string
        }
        Insert: {
          agreement_id: string
          applied_fee_rate?: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          custom_fee_rate?: number | null
          fee_installments?: number
          fee_per_installment?: number
          id?: string
          installment_id: string
          new_due_date: string
          original_due_date: string
          original_fee_rate?: number
          rejection_reason?: string | null
          requested_by: string
          reschedule_fee?: number
          safeguard_applied?: boolean
          slip_url?: string | null
          status?: string
          submitted_amount?: number | null
          updated_at?: string
        }
        Update: {
          agreement_id?: string
          applied_fee_rate?: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          custom_fee_rate?: number | null
          fee_installments?: number
          fee_per_installment?: number
          id?: string
          installment_id?: string
          new_due_date?: string
          original_due_date?: string
          original_fee_rate?: number
          rejection_reason?: string | null
          requested_by?: string
          reschedule_fee?: number
          safeguard_applied?: boolean
          slip_url?: string | null
          status?: string
          submitted_amount?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reschedule_requests_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "debt_agreements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reschedule_requests_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "debt_agreements_secure"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reschedule_requests_installment_id_fkey"
            columns: ["installment_id"]
            isOneToOne: false
            referencedRelation: "installments"
            referencedColumns: ["id"]
          },
        ]
      }
      slip_verifications: {
        Row: {
          agreement_id: string
          created_at: string
          id: string
          installment_id: string
          rejection_reason: string | null
          slip_url: string
          status: string
          submitted_amount: number
          submitted_by: string
          verified_amount: number | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          agreement_id: string
          created_at?: string
          id?: string
          installment_id: string
          rejection_reason?: string | null
          slip_url: string
          status?: string
          submitted_amount: number
          submitted_by: string
          verified_amount?: number | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          agreement_id?: string
          created_at?: string
          id?: string
          installment_id?: string
          rejection_reason?: string | null
          slip_url?: string
          status?: string
          submitted_amount?: number
          submitted_by?: string
          verified_amount?: number | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "slip_verifications_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "debt_agreements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slip_verifications_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "debt_agreements_secure"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slip_verifications_installment_id_fkey"
            columns: ["installment_id"]
            isOneToOne: false
            referencedRelation: "installments"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          is_trial: boolean
          started_at: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          tier: Database["public"]["Enums"]["subscription_tier"]
          trial_ends_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          is_trial?: boolean
          started_at?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tier?: Database["public"]["Enums"]["subscription_tier"]
          trial_ends_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          is_trial?: boolean
          started_at?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tier?: Database["public"]["Enums"]["subscription_tier"]
          trial_ends_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tips: {
        Row: {
          amount: number
          completed_at: string | null
          created_at: string
          currency: string
          display_name: string | null
          id: string
          is_anonymous: boolean
          message: string | null
          payment_method: string | null
          status: string
          transaction_ref: string | null
          user_id: string | null
        }
        Insert: {
          amount: number
          completed_at?: string | null
          created_at?: string
          currency?: string
          display_name?: string | null
          id?: string
          is_anonymous?: boolean
          message?: string | null
          payment_method?: string | null
          status?: string
          transaction_ref?: string | null
          user_id?: string | null
        }
        Update: {
          amount?: number
          completed_at?: string | null
          created_at?: string
          currency?: string
          display_name?: string | null
          id?: string
          is_anonymous?: boolean
          message?: string | null
          payment_method?: string | null
          status?: string
          transaction_ref?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      user_points: {
        Row: {
          created_at: string
          daily_earned_today: number
          id: string
          last_daily_reset: string | null
          lifetime_points: number
          total_points: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          daily_earned_today?: number
          id?: string
          last_daily_reset?: string | null
          lifetime_points?: number
          total_points?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          daily_earned_today?: number
          id?: string
          last_daily_reset?: string | null
          lifetime_points?: number
          total_points?: number
          updated_at?: string
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
    }
    Views: {
      debt_agreements_secure: {
        Row: {
          account_name: string | null
          account_number: string | null
          bank_name: string | null
          borrower_confirmed: boolean | null
          borrower_id: string | null
          borrower_name: string | null
          borrower_phone: string | null
          created_at: string | null
          description: string | null
          frequency: string | null
          id: string | null
          interest_rate: number | null
          interest_type: string | null
          lender_confirmed: boolean | null
          lender_id: string | null
          num_installments: number | null
          principal_amount: number | null
          reschedule_fee_rate: number | null
          reschedule_interest_multiplier: number | null
          start_date: string | null
          status: string | null
          total_amount: number | null
          updated_at: string | null
        }
        Insert: {
          account_name?: string | null
          account_number?: string | null
          bank_name?: string | null
          borrower_confirmed?: boolean | null
          borrower_id?: string | null
          borrower_name?: never
          borrower_phone?: never
          created_at?: string | null
          description?: string | null
          frequency?: string | null
          id?: string | null
          interest_rate?: number | null
          interest_type?: string | null
          lender_confirmed?: boolean | null
          lender_id?: string | null
          num_installments?: number | null
          principal_amount?: number | null
          reschedule_fee_rate?: number | null
          reschedule_interest_multiplier?: number | null
          start_date?: string | null
          status?: string | null
          total_amount?: number | null
          updated_at?: string | null
        }
        Update: {
          account_name?: string | null
          account_number?: string | null
          bank_name?: string | null
          borrower_confirmed?: boolean | null
          borrower_id?: string | null
          borrower_name?: never
          borrower_phone?: never
          created_at?: string | null
          description?: string | null
          frequency?: string | null
          id?: string | null
          interest_rate?: number | null
          interest_type?: string | null
          lender_confirmed?: boolean | null
          lender_id?: string | null
          num_installments?: number | null
          principal_amount?: number | null
          reschedule_fee_rate?: number | null
          reschedule_interest_multiplier?: number | null
          start_date?: string | null
          status?: string | null
          total_amount?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      add_agreement_credits: {
        Args: { p_credits: number; p_user_id: string }
        Returns: boolean
      }
      can_create_agreement_free: { Args: { p_user_id: string }; Returns: Json }
      can_view_profile: { Args: { target_user_id: string }; Returns: boolean }
      check_admin_lock_status: { Args: { p_user_id: string }; Returns: Json }
      check_suspicious_login: { Args: { p_user_id: string }; Returns: boolean }
      cleanup_deleted_personas: { Args: never; Returns: number }
      create_admin_code:
        | {
            Args: {
              p_code: string
              p_code_name: string
              p_role?: Database["public"]["Enums"]["app_role"]
            }
            Returns: Json
          }
        | {
            Args: {
              p_code: string
              p_code_name: string
              p_expires_at?: string
              p_role?: Database["public"]["Enums"]["app_role"]
            }
            Returns: Json
          }
      create_notification: {
        Args: {
          p_message: string
          p_related_id?: string
          p_related_type?: string
          p_title: string
          p_type: string
          p_user_id: string
        }
        Returns: string
      }
      delete_admin_code: { Args: { p_code_id: string }; Returns: Json }
      downgrade_expired_trials: { Args: never; Returns: number }
      generate_admin_otp: { Args: { p_user_id: string }; Returns: string }
      generate_and_send_admin_otp: {
        Args: { p_user_id: string }
        Returns: Json
      }
      generate_user_code: { Args: never; Returns: string }
      grant_user_role: {
        Args: {
          p_role: Database["public"]["Enums"]["app_role"]
          p_user_id: string
        }
        Returns: Json
      }
      get_debt_agreement_safe: {
        Args: { p_agreement_id: string }
        Returns: {
          borrower_confirmed: boolean
          borrower_id: string
          borrower_name: string
          borrower_phone: string
          created_at: string
          description: string
          frequency: string
          id: string
          interest_rate: number
          interest_type: string
          lender_confirmed: boolean
          lender_id: string
          num_installments: number
          principal_amount: number
          reschedule_fee_rate: number
          reschedule_interest_multiplier: number
          start_date: string
          status: string
          total_amount: number
          updated_at: string
        }[]
      }
      get_suspicious_activities: {
        Args: { p_hours?: number }
        Returns: {
          action_count: number
          action_type: string
          last_occurrence: string
          user_id: string
        }[]
      }
      get_user_tier: {
        Args: { p_user_id: string }
        Returns: Database["public"]["Enums"]["subscription_tier"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      invoke_edge_function_securely: {
        Args: { function_name: string }
        Returns: undefined
      }
      log_activity: {
        Args: {
          p_action_category?: string
          p_action_type: string
          p_is_suspicious?: boolean
          p_metadata?: Json
          p_user_id: string
        }
        Returns: string
      }
      record_agreement_payment: {
        Args: {
          p_agreement_id: string
          p_amount: number
          p_currency?: string
          p_payment_method?: string
          p_user_id: string
        }
        Returns: string
      }
      record_tip: {
        Args: {
          p_amount: number
          p_currency?: string
          p_display_name?: string
          p_is_anonymous?: boolean
          p_message?: string
          p_user_id: string
        }
        Returns: string
      }
      revoke_user_role: {
        Args: {
          p_role: Database["public"]["Enums"]["app_role"]
          p_user_id: string
        }
        Returns: Json
      }
      search_profile_by_code: {
        Args: { search_code: string }
        Returns: {
          avatar_url: string
          display_name: string
          user_code: string
          user_id: string
        }[]
      }
      start_premium_trial: { Args: { p_user_id: string }; Returns: boolean }
      update_admin_code: {
        Args: {
          p_clear_expiry?: boolean
          p_code_id: string
          p_code_name?: string
          p_expires_at?: string
          p_is_active?: boolean
        }
        Returns: Json
      }
      use_agreement_credit: { Args: { p_user_id: string }; Returns: boolean }
      use_free_agreement_slot: { Args: { p_user_id: string }; Returns: boolean }
      verify_admin_code: { Args: { p_code: string }; Returns: Json }
      verify_admin_otp: {
        Args: { p_otp: string; p_user_id: string }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      chat_room_type: "debt" | "agreement" | "casual"
      notification_priority: "critical" | "important" | "info"
      pending_action_type: "pay" | "confirm" | "extend" | "none"
      subscription_tier: "free" | "premium"
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
      app_role: ["admin", "moderator", "user"],
      chat_room_type: ["debt", "agreement", "casual"],
      notification_priority: ["critical", "important", "info"],
      pending_action_type: ["pay", "confirm", "extend", "none"],
      subscription_tier: ["free", "premium"],
    },
  },
} as const
