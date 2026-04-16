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
          headline: string;
          niche: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          dm_access?: Database['public']['Enums']['dm_access'];
          headline?: string;
          niche?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          dm_access?: Database['public']['Enums']['dm_access'];
          headline?: string;
          niche?: string;
          updated_at?: string;
          user_id?: string;
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
      is_conversation_participant: {
        Args: {
          conversation_uuid: string;
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
      register_push_device: {
        Args: {
          expo_push_token: string;
          device_platform?: string;
          device_name?: string;
          device_model?: string;
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
