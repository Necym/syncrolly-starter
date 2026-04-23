export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      conversation_participants: {
        Row: {
          conversation_id: string;
          joined_at: string;
          last_read_at: string | null;
          user_id: string;
        };
        Insert: {
          conversation_id: string;
          joined_at?: string;
          last_read_at?: string | null;
          user_id: string;
        };
        Update: {
          conversation_id?: string;
          joined_at?: string;
          last_read_at?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      conversations: {
        Row: {
          created_at: string;
          created_by: string;
          id: string;
          last_message_at: string | null;
          status: Database['public']['Enums']['thread_status'];
          subject: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          id?: string;
          last_message_at?: string | null;
          status?: Database['public']['Enums']['thread_status'];
          subject?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          id?: string;
          last_message_at?: string | null;
          status?: Database['public']['Enums']['thread_status'];
          subject?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      creator_profiles: {
        Row: {
          created_at: string;
          dm_access: Database['public']['Enums']['dm_access'];
          dm_fee_usd: number;
          dm_intake_policy: Database['public']['Enums']['dm_intake_policy'];
          headline: string;
          niche: string;
          page_blocks: Json;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          dm_access?: Database['public']['Enums']['dm_access'];
          dm_fee_usd?: number;
          dm_intake_policy?: Database['public']['Enums']['dm_intake_policy'];
          headline?: string;
          niche?: string;
          page_blocks?: Json;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          dm_access?: Database['public']['Enums']['dm_access'];
          dm_fee_usd?: number;
          dm_intake_policy?: Database['public']['Enums']['dm_intake_policy'];
          headline?: string;
          niche?: string;
          page_blocks?: Json;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      inquiry_form_answers: {
        Row: {
          answer_text: string;
          created_at: string;
          id: string;
          question_id: string;
          selected_option_id: string | null;
          submission_id: string;
        };
        Insert: {
          answer_text?: string;
          created_at?: string;
          id?: string;
          question_id: string;
          selected_option_id?: string | null;
          submission_id: string;
        };
        Update: {
          answer_text?: string;
          created_at?: string;
          id?: string;
          question_id?: string;
          selected_option_id?: string | null;
          submission_id?: string;
        };
        Relationships: [];
      };
      inquiry_form_question_options: {
        Row: {
          created_at: string;
          id: string;
          label: string;
          position: number;
          question_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          label: string;
          position: number;
          question_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          label?: string;
          position?: number;
          question_id?: string;
        };
        Relationships: [];
      };
      inquiry_form_questions: {
        Row: {
          created_at: string;
          form_id: string;
          id: string;
          placeholder: string;
          position: number;
          prompt: string;
          type: Database['public']['Enums']['form_question_type'];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          form_id: string;
          id?: string;
          placeholder?: string;
          position: number;
          prompt: string;
          type: Database['public']['Enums']['form_question_type'];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          form_id?: string;
          id?: string;
          placeholder?: string;
          position?: number;
          prompt?: string;
          type?: Database['public']['Enums']['form_question_type'];
          updated_at?: string;
        };
        Relationships: [];
      };
      inquiry_form_submissions: {
        Row: {
          conversation_id: string | null;
          created_at: string;
          creator_id: string;
          form_id: string;
          id: string;
          status: Database['public']['Enums']['inquiry_form_submission_status'];
          supporter_avatar_url: string | null;
          supporter_display_name: string | null;
          supporter_id: string;
          updated_at: string;
        };
        Insert: {
          conversation_id?: string | null;
          created_at?: string;
          creator_id: string;
          form_id: string;
          id?: string;
          status?: Database['public']['Enums']['inquiry_form_submission_status'];
          supporter_avatar_url?: string | null;
          supporter_display_name?: string | null;
          supporter_id: string;
          updated_at?: string;
        };
        Update: {
          conversation_id?: string | null;
          created_at?: string;
          creator_id?: string;
          form_id?: string;
          id?: string;
          status?: Database['public']['Enums']['inquiry_form_submission_status'];
          supporter_avatar_url?: string | null;
          supporter_display_name?: string | null;
          supporter_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      inquiry_forms: {
        Row: {
          created_at: string;
          creator_id: string;
          id: string;
          intro: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          creator_id: string;
          id?: string;
          intro?: string;
          title?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          creator_id?: string;
          id?: string;
          intro?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      instagram_account_connections: {
        Row: {
          created_at: string;
          creator_id: string;
          facebook_user_id: string | null;
          id: string;
          instagram_profile_picture_url: string | null;
          instagram_user_id: string;
          instagram_username: string | null;
          last_synced_at: string | null;
          page_id: string;
          page_name: string | null;
          status: Database['public']['Enums']['instagram_connection_status'];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          creator_id: string;
          facebook_user_id?: string | null;
          id?: string;
          instagram_profile_picture_url?: string | null;
          instagram_user_id: string;
          instagram_username?: string | null;
          last_synced_at?: string | null;
          page_id: string;
          page_name?: string | null;
          status?: Database['public']['Enums']['instagram_connection_status'];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          creator_id?: string;
          facebook_user_id?: string | null;
          id?: string;
          instagram_profile_picture_url?: string | null;
          instagram_user_id?: string;
          instagram_username?: string | null;
          last_synced_at?: string | null;
          page_id?: string;
          page_name?: string | null;
          status?: Database['public']['Enums']['instagram_connection_status'];
          updated_at?: string;
        };
        Relationships: [];
      };
      instagram_lead_messages: {
        Row: {
          connection_id: string;
          created_at: string;
          direction: Database['public']['Enums']['instagram_message_direction'];
          id: string;
          lead_id: string;
          message_type: string;
          meta_message_id: string | null;
          raw_payload: Json;
          sent_at: string;
          text_body: string;
        };
        Insert: {
          connection_id: string;
          created_at?: string;
          direction: Database['public']['Enums']['instagram_message_direction'];
          id?: string;
          lead_id: string;
          message_type?: string;
          meta_message_id?: string | null;
          raw_payload?: Json;
          sent_at?: string;
          text_body?: string;
        };
        Update: {
          connection_id?: string;
          created_at?: string;
          direction?: Database['public']['Enums']['instagram_message_direction'];
          id?: string;
          lead_id?: string;
          message_type?: string;
          meta_message_id?: string | null;
          raw_payload?: Json;
          sent_at?: string;
          text_body?: string;
        };
        Relationships: [];
      };
      instagram_leads: {
        Row: {
          connection_id: string;
          created_at: string;
          creator_id: string;
          display_name: string;
          id: string;
          instagram_scoped_user_id: string;
          instagram_thread_key: string;
          instagram_username: string | null;
          last_message_at: string;
          last_message_text: string;
          lead_status: Database['public']['Enums']['instagram_lead_status'];
          profile_picture_url: string | null;
          unread_count: number;
          updated_at: string;
        };
        Insert: {
          connection_id: string;
          created_at?: string;
          creator_id: string;
          display_name?: string;
          id?: string;
          instagram_scoped_user_id: string;
          instagram_thread_key: string;
          instagram_username?: string | null;
          last_message_at?: string;
          last_message_text?: string;
          lead_status?: Database['public']['Enums']['instagram_lead_status'];
          profile_picture_url?: string | null;
          unread_count?: number;
          updated_at?: string;
        };
        Update: {
          connection_id?: string;
          created_at?: string;
          creator_id?: string;
          display_name?: string;
          id?: string;
          instagram_scoped_user_id?: string;
          instagram_thread_key?: string;
          instagram_username?: string | null;
          last_message_at?: string;
          last_message_text?: string;
          lead_status?: Database['public']['Enums']['instagram_lead_status'];
          profile_picture_url?: string | null;
          unread_count?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      instagram_webhook_events: {
        Row: {
          connection_id: string | null;
          created_at: string;
          event_type: string;
          id: string;
          meta_event_id: string | null;
          object_type: string;
          payload: Json;
          processed_at: string | null;
        };
        Insert: {
          connection_id?: string | null;
          created_at?: string;
          event_type: string;
          id?: string;
          meta_event_id?: string | null;
          object_type: string;
          payload?: Json;
          processed_at?: string | null;
        };
        Update: {
          connection_id?: string | null;
          created_at?: string;
          event_type?: string;
          id?: string;
          meta_event_id?: string | null;
          object_type?: string;
          payload?: Json;
          processed_at?: string | null;
        };
        Relationships: [];
      };
      messages: {
        Row: {
          body: string;
          conversation_id: string;
          created_at: string;
          id: string;
          sender_id: string;
        };
        Insert: {
          body: string;
          conversation_id: string;
          created_at?: string;
          id?: string;
          sender_id: string;
        };
        Update: {
          body?: string;
          conversation_id?: string;
          created_at?: string;
          id?: string;
          sender_id?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          accent_color: string;
          avatar_url: string | null;
          bio: string;
          cover_image_url: string | null;
          created_at: string;
          display_name: string;
          id: string;
          is_discoverable: boolean;
          presence: Database['public']['Enums']['user_presence'];
          role: Database['public']['Enums']['user_role'];
          updated_at: string;
        };
        Insert: {
          accent_color?: string;
          avatar_url?: string | null;
          bio?: string;
          cover_image_url?: string | null;
          created_at?: string;
          display_name: string;
          id: string;
          is_discoverable?: boolean;
          presence?: Database['public']['Enums']['user_presence'];
          role: Database['public']['Enums']['user_role'];
          updated_at?: string;
        };
        Update: {
          accent_color?: string;
          avatar_url?: string | null;
          bio?: string;
          cover_image_url?: string | null;
          created_at?: string;
          display_name?: string;
          id?: string;
          is_discoverable?: boolean;
          presence?: Database['public']['Enums']['user_presence'];
          role?: Database['public']['Enums']['user_role'];
          updated_at?: string;
        };
        Relationships: [];
      };
      profile_posts: {
        Row: {
          body: string;
          created_at: string;
          id: string;
          image_url: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          body?: string;
          created_at?: string;
          id?: string;
          image_url?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          id?: string;
          image_url?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      profile_post_likes: {
        Row: {
          created_at: string;
          post_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          post_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          post_id?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      programs: {
        Row: {
          created_at: string;
          creator_id: string;
          description: string;
          id: string;
          subtitle: string;
          thumbnail_url: string | null;
          title: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          creator_id: string;
          description?: string;
          id?: string;
          subtitle?: string;
          thumbnail_url?: string | null;
          title: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          creator_id?: string;
          description?: string;
          id?: string;
          subtitle?: string;
          thumbnail_url?: string | null;
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      program_lessons: {
        Row: {
          created_at: string;
          duration_label: string | null;
          id: string;
          position: number;
          program_id: string;
          summary: string;
          title: string;
          updated_at: string;
          video_url: string | null;
        };
        Insert: {
          created_at?: string;
          duration_label?: string | null;
          id?: string;
          position: number;
          program_id: string;
          summary?: string;
          title: string;
          updated_at?: string;
          video_url?: string | null;
        };
        Update: {
          created_at?: string;
          duration_label?: string | null;
          id?: string;
          position?: number;
          program_id?: string;
          summary?: string;
          title?: string;
          updated_at?: string;
          video_url?: string | null;
        };
        Relationships: [];
      };
      program_enrollments: {
        Row: {
          created_at: string;
          id: string;
          program_id: string;
          student_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          program_id: string;
          student_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          program_id?: string;
          student_id?: string;
        };
        Relationships: [];
      };
      lesson_progress: {
        Row: {
          completed_at: string | null;
          created_at: string;
          id: string;
          lesson_id: string;
          last_position_seconds: number;
          progress_percent: number;
          student_id: string;
          updated_at: string;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          lesson_id: string;
          last_position_seconds?: number;
          progress_percent?: number;
          student_id: string;
          updated_at?: string;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          id?: string;
          lesson_id?: string;
          last_position_seconds?: number;
          progress_percent?: number;
          student_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      scheduled_calls: {
        Row: {
          attendee_profile_id: string | null;
          conversation_id: string | null;
          created_at: string;
          ends_at: string;
          id: string;
          owner_id: string;
          responded_at: string | null;
          starts_at: string;
          status: Database['public']['Enums']['scheduled_call_status'];
          title: string;
          updated_at: string;
        };
        Insert: {
          attendee_profile_id?: string | null;
          conversation_id?: string | null;
          created_at?: string;
          ends_at: string;
          id?: string;
          owner_id: string;
          responded_at?: string | null;
          starts_at: string;
          status?: Database['public']['Enums']['scheduled_call_status'];
          title: string;
          updated_at?: string;
        };
        Update: {
          attendee_profile_id?: string | null;
          conversation_id?: string | null;
          created_at?: string;
          ends_at?: string;
          id?: string;
          owner_id?: string;
          responded_at?: string | null;
          starts_at?: string;
          status?: Database['public']['Enums']['scheduled_call_status'];
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      push_devices: {
        Row: {
          created_at: string;
          device_model: string | null;
          device_name: string | null;
          expo_push_token: string;
          id: string;
          last_seen_at: string;
          platform: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          device_model?: string | null;
          device_name?: string | null;
          expo_push_token: string;
          id?: string;
          last_seen_at?: string;
          platform?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          device_model?: string | null;
          device_name?: string | null;
          expo_push_token?: string;
          id?: string;
          last_seen_at?: string;
          platform?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      supporter_profiles: {
        Row: {
          access_level: Database['public']['Enums']['access_level'];
          created_at: string;
          total_spend: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          access_level?: Database['public']['Enums']['access_level'];
          created_at?: string;
          total_spend?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          access_level?: Database['public']['Enums']['access_level'];
          created_at?: string;
          total_spend?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {};
    Functions: {
      approve_conversation_request: {
        Args: {
          conversation_uuid: string;
        };
        Returns: string;
      };
      delete_direct_conversation: {
        Args: {
          conversation_uuid: string;
        };
        Returns: string;
      };
      delete_inquiry_submission: {
        Args: {
          submission_uuid: string;
        };
        Returns: string;
      };
      owns_inquiry_form: {
        Args: {
          form_uuid: string;
          user_uuid?: string;
        };
        Returns: boolean;
      };
      owns_inquiry_question: {
        Args: {
          question_uuid: string;
          user_uuid?: string;
        };
        Returns: boolean;
      };
      can_send_conversation_message: {
        Args: {
          conversation_uuid: string;
          sender_uuid?: string;
        };
        Returns: boolean;
      };
      is_conversation_participant: {
        Args: {
          conversation_uuid: string;
        };
        Returns: boolean;
      };
      is_creator_participant: {
        Args: {
          conversation_uuid: string;
          user_uuid?: string;
        };
        Returns: boolean;
      };
      get_or_create_direct_conversation: {
        Args: {
          target_user_id: string;
          conversation_subject?: string;
        };
        Returns: string;
      };
      get_public_profile: {
        Args: {
          profile_user_id: string;
        };
        Returns: {
          accent_color: string;
          avatar_url: string | null;
          bio: string;
          cover_image_url: string | null;
          display_name: string;
          dm_access: Database['public']['Enums']['dm_access'] | null;
          dm_fee_usd: number | null;
          dm_intake_policy: Database['public']['Enums']['dm_intake_policy'] | null;
          headline: string | null;
          id: string;
          niche: string | null;
          page_blocks: Json | null;
          presence: Database['public']['Enums']['user_presence'];
          role: Database['public']['Enums']['user_role'];
        }[];
      };
      open_inquiry_submission_conversation: {
        Args: {
          submission_uuid: string;
        };
        Returns: string;
      };
      register_push_device: {
        Args: {
          expo_push_token: string;
          device_platform?: string;
          device_name?: string;
          device_model?: string;
        };
        Returns: string;
      };
      record_lesson_progress: {
        Args: {
          target_lesson_id: string;
          target_completed_at?: string;
        };
        Returns: string;
      };
      save_lesson_progress: {
        Args: {
          target_lesson_id: string;
          target_progress_percent?: number;
          target_last_position_seconds?: number;
          mark_complete?: boolean;
        };
        Returns: string;
      };
      create_scheduled_call: {
        Args: {
          next_attendee_profile_id?: string | null;
          next_conversation_id?: string | null;
          next_title: string;
          next_starts_at: string;
          next_ends_at: string;
        };
        Returns: string;
      };
      respond_to_scheduled_call_invitation: {
        Args: {
          call_uuid: string;
          next_status: Database['public']['Enums']['scheduled_call_status'];
        };
        Returns: string;
      };
      reschedule_scheduled_call: {
        Args: {
          call_uuid: string;
          next_title: string;
          next_starts_at: string;
          next_ends_at: string;
        };
        Returns: string;
      };
      cancel_scheduled_call: {
        Args: {
          call_uuid: string;
        };
        Returns: string;
      };
      resolve_direct_thread_status: {
        Args: {
          viewer_uuid: string;
          target_uuid: string;
        };
        Returns: Database['public']['Enums']['thread_status'];
      };
      save_inquiry_form: {
        Args: {
          form_title?: string;
          form_intro?: string;
          form_questions?: Json;
        };
        Returns: string;
      };
      search_profiles: {
        Args: {
          search_term: string;
        };
        Returns: {
          accent_color: string;
          avatar_url: string | null;
          display_name: string;
          id: string;
          presence: Database['public']['Enums']['user_presence'];
          role: Database['public']['Enums']['user_role'];
        }[];
      };
      shares_conversation_with: {
        Args: {
          target_user_id: string;
        };
        Returns: boolean;
      };
      submit_inquiry_form: {
        Args: {
          target_form_id: string;
          submission_answers?: Json;
        };
        Returns: string;
      };
      update_inquiry_submission_status: {
        Args: {
          submission_uuid: string;
          next_status: Database['public']['Enums']['inquiry_form_submission_status'];
        };
        Returns: string;
      };
      unregister_push_device: {
        Args: {
          expo_push_token: string;
        };
        Returns: undefined;
      };
    };
    Enums: {
      access_level: 'free' | 'subscriber' | 'paid' | 'vip';
      dm_access: 'free' | 'subscriber_only' | 'paid_only';
      dm_intake_policy: 'direct_message' | 'form' | 'paid_fee';
      form_question_type: 'multiple_choice' | 'short_text' | 'long_text';
      instagram_connection_status: 'active' | 'expired' | 'revoked' | 'needs_reauth';
      instagram_lead_status: 'new' | 'replied' | 'qualified' | 'archived';
      instagram_message_direction: 'inbound' | 'outbound';
      inquiry_form_submission_status: 'pending' | 'opened' | 'qualified' | 'booked' | 'enrolled';
      scheduled_call_status: 'pending' | 'accepted' | 'declined';
      thread_status: 'active' | 'request' | 'flagged';
      user_presence: 'online' | 'away' | 'offline';
      user_role: 'creator' | 'supporter';
    };
    CompositeTypes: {};
  };
};

export type PublicSchema = Database['public'];
export type PublicTableName = keyof PublicSchema['Tables'];
export type PublicRow<TableName extends PublicTableName> = PublicSchema['Tables'][TableName]['Row'];
