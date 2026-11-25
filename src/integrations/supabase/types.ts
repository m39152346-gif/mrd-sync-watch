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
      messages: {
        Row: {
          body: string
          color: string
          created_at: string
          display_name: string
          id: string
          room_id: string
        }
        Insert: {
          body: string
          color?: string
          created_at?: string
          display_name: string
          id?: string
          room_id: string
        }
        Update: {
          body?: string
          color?: string
          created_at?: string
          display_name?: string
          id?: string
          room_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      participants: {
        Row: {
          admission_status: string
          color: string
          created_at: string
          display_name: string
          id: string
          is_host: boolean
          last_seen_at: string
          room_id: string
          session_token: string
          user_id: string | null
        }
        Insert: {
          admission_status?: string
          color?: string
          created_at?: string
          display_name: string
          id?: string
          is_host?: boolean
          last_seen_at?: string
          room_id: string
          session_token: string
          user_id?: string | null
        }
        Update: {
          admission_status?: string
          color?: string
          created_at?: string
          display_name?: string
          id?: string
          is_host?: boolean
          last_seen_at?: string
          room_id?: string
          session_token?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "participants_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      player_state: {
        Row: {
          is_playing: boolean
          position_seconds: number
          room_id: string
          source_ref: string | null
          source_title: string | null
          source_type: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          is_playing?: boolean
          position_seconds?: number
          room_id: string
          source_ref?: string | null
          source_title?: string | null
          source_type?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          is_playing?: boolean
          position_seconds?: number
          room_id?: string
          source_ref?: string | null
          source_title?: string | null
          source_type?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_state_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: true
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
        }
        Relationships: []
      }
      room_access_credentials: {
        Row: {
          key_hash: string
          participant_id: string
          room_id: string
        }
        Insert: {
          key_hash: string
          participant_id: string
          room_id: string
        }
        Update: {
          key_hash?: string
          participant_id?: string
          room_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_access_credentials_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: true
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_access_credentials_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      room_event_credentials: {
        Row: {
          room_id: string
          topic: string
        }
        Insert: {
          room_id: string
          topic?: string
        }
        Update: {
          room_id?: string
          topic?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_event_credentials_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: true
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      room_owner_credentials: {
        Row: {
          room_id: string
          secret_hash: string
        }
        Insert: {
          room_id: string
          secret_hash: string
        }
        Update: {
          room_id?: string
          secret_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_owner_credentials_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: true
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          code: string
          created_at: string
          host_session: string
          id: string
        }
        Insert: {
          code: string
          created_at?: string
          host_session: string
          id?: string
        }
        Update: {
          code?: string
          created_at?: string
          host_session?: string
          id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      sw_claim_host: {
        Args: { _code: string; _secret: string }
        Returns: boolean
      }
      sw_create: { Args: { _code: string; _name: string }; Returns: Json }
      sw_delete_room: { Args: { _code: string }; Returns: boolean }
      sw_enter: { Args: { _code: string; _name: string }; Returns: Json }
      sw_heartbeat: {
        Args: { _leaving?: boolean; _position?: number; _room: string }
        Returns: undefined
      }
      sw_hosted_rooms: { Args: { _codes: string[] }; Returns: string[] }
      sw_is_host: { Args: { _room: string }; Returns: boolean }
      sw_key_hash: { Args: never; Returns: string }
      sw_kick: {
        Args: { _participant: string; _room: string }
        Returns: undefined
      }
      sw_member_id: { Args: { _room: string }; Returns: string }
      sw_message: { Args: { _body: string; _room: string }; Returns: undefined }
      sw_owner_link: {
        Args: { _room: string; _secret: string }
        Returns: undefined
      }
      sw_playback: { Args: { _patch: Json; _room: string }; Returns: Json }
      sw_rebind: {
        Args: { _key: string; _room: string; _target: string }
        Returns: undefined
      }
      sw_review: {
        Args: { _approve: boolean; _participant: string; _room: string }
        Returns: undefined
      }
      sw_room_exists: { Args: { _code: string }; Returns: boolean }
      sw_snapshot: { Args: { _code: string }; Returns: Json }
      sw_storage_access: {
        Args: { _path: string; _write?: boolean }
        Returns: boolean
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
    Enums: {},
  },
} as const
