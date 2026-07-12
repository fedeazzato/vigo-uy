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
      part_purchases: {
        Row: {
          category: string
          city: string | null
          created_at: string
          hidden: boolean
          id: string
          is_public: boolean
          item: string
          notes: string | null
          odometer_km: number | null
          price_uyu: number
          purchase_date: string
          rating: number | null
          store: string
          user_id: string
          vehicle_id: string | null
        }
        Insert: {
          category: string
          city?: string | null
          created_at?: string
          hidden?: boolean
          id?: string
          is_public?: boolean
          item: string
          notes?: string | null
          odometer_km?: number | null
          price_uyu: number
          purchase_date: string
          rating?: number | null
          store: string
          user_id: string
          vehicle_id?: string | null
        }
        Update: {
          category?: string
          city?: string | null
          created_at?: string
          hidden?: boolean
          id?: string
          is_public?: boolean
          item?: string
          notes?: string | null
          odometer_km?: number | null
          price_uyu?: number
          purchase_date?: string
          rating?: number | null
          store?: string
          user_id?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "part_purchases_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicle_km_leaderboard"
            referencedColumns: ["vehicle_id"]
          },
          {
            foreignKeyName: "part_purchases_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          banned_at: string | null
          city: string | null
          color: string | null
          created_at: string
          display_name: string
          id: string
          is_moderator: boolean
          model: string | null
        }
        Insert: {
          banned_at?: string | null
          city?: string | null
          color?: string | null
          created_at?: string
          display_name: string
          id: string
          is_moderator?: boolean
          model?: string | null
        }
        Update: {
          banned_at?: string | null
          city?: string | null
          color?: string | null
          created_at?: string
          display_name?: string
          id?: string
          is_moderator?: boolean
          model?: string | null
        }
        Relationships: []
      }
      service_entries: {
        Row: {
          city: string | null
          cost_uyu: number
          created_at: string
          dealer: string
          hidden: boolean
          id: string
          is_public: boolean
          notes: string | null
          odometer_km: number
          service_date: string
          service_type: string
          user_id: string
          vehicle_id: string | null
        }
        Insert: {
          city?: string | null
          cost_uyu: number
          created_at?: string
          dealer: string
          hidden?: boolean
          id?: string
          is_public?: boolean
          notes?: string | null
          odometer_km: number
          service_date: string
          service_type: string
          user_id: string
          vehicle_id?: string | null
        }
        Update: {
          city?: string | null
          cost_uyu?: number
          created_at?: string
          dealer?: string
          hidden?: boolean
          id?: string
          is_public?: boolean
          notes?: string | null
          odometer_km?: number
          service_date?: string
          service_type?: string
          user_id?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_entries_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicle_km_leaderboard"
            referencedColumns: ["vehicle_id"]
          },
          {
            foreignKeyName: "service_entries_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_logs: {
        Row: {
          average_speed_kmh: number | null
          charging_stops: Json
          created_at: string
          destination: string
          distance_km: number | null
          ending_charge_percentage: number | null
          hidden: boolean
          id: string
          is_public: boolean
          model: string | null
          notes: string | null
          origin: string
          rating: number | null
          starting_charge_percentage: number | null
          title: string
          trip_date: string
          user_id: string
          vehicle_id: string | null
        }
        Insert: {
          average_speed_kmh?: number | null
          charging_stops?: Json
          created_at?: string
          destination: string
          distance_km?: number | null
          ending_charge_percentage?: number | null
          hidden?: boolean
          id?: string
          is_public?: boolean
          model?: string | null
          notes?: string | null
          origin: string
          rating?: number | null
          starting_charge_percentage?: number | null
          title: string
          trip_date: string
          user_id: string
          vehicle_id?: string | null
        }
        Update: {
          average_speed_kmh?: number | null
          charging_stops?: Json
          created_at?: string
          destination?: string
          distance_km?: number | null
          ending_charge_percentage?: number | null
          hidden?: boolean
          id?: string
          is_public?: boolean
          model?: string | null
          notes?: string | null
          origin?: string
          rating?: number | null
          starting_charge_percentage?: number | null
          title?: string
          trip_date?: string
          user_id?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trip_logs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicle_km_leaderboard"
            referencedColumns: ["vehicle_id"]
          },
          {
            foreignKeyName: "trip_logs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_members: {
        Row: {
          joined_at: string
          user_id: string
          vehicle_id: string
        }
        Insert: {
          joined_at?: string
          user_id: string
          vehicle_id: string
        }
        Update: {
          joined_at?: string
          user_id?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_members_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicle_km_leaderboard"
            referencedColumns: ["vehicle_id"]
          },
          {
            foreignKeyName: "vehicle_members_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          color: string | null
          created_at: string
          created_by: string | null
          id: string
          join_code: string
          model: string | null
          plate: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          join_code: string
          model?: string | null
          plate?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          join_code?: string
          model?: string | null
          plate?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      community_totals: {
        Row: {
          contributor_count: number | null
          total_km: number | null
          total_trips: number | null
        }
        Relationships: []
      }
      public_profiles: {
        Row: {
          display_name: string | null
          id: string | null
        }
        Insert: {
          display_name?: string | null
          id?: string | null
        }
        Update: {
          display_name?: string | null
          id?: string | null
        }
        Relationships: []
      }
      service_cost_stats_by_city: {
        Row: {
          avg_cost_uyu: number | null
          city: string | null
          entry_count: number | null
        }
        Relationships: []
      }
      trip_stats_by_model: {
        Row: {
          avg_distance_km: number | null
          avg_speed_kmh: number | null
          model: string | null
          trip_count: number | null
        }
        Relationships: []
      }
      vehicle_km_leaderboard: {
        Row: {
          member_names: string[] | null
          total_km: number | null
          trip_count: number | null
          vehicle_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_list_users: {
        Args: never
        Returns: {
          banned_at: string
          city: string
          created_at: string
          display_name: string
          id: string
          is_moderator: boolean
          model: string
          purchase_count: number
          service_count: number
          trip_count: number
          vehicle_member_count: number
        }[]
      }
      admin_set_user_banned: {
        Args: { banned: boolean; target_user: string }
        Returns: undefined
      }
      admin_set_user_moderator: {
        Args: { make_moderator: boolean; target_user: string }
        Returns: undefined
      }
      assert_moderator: { Args: never; Returns: undefined }
      cleanup_orphan_vehicle: { Args: { v_id: string }; Returns: undefined }
      current_user_vehicle_id: { Args: never; Returns: string }
      generate_join_code: { Args: never; Returns: string }
      is_user_banned: { Args: { uid: string }; Returns: boolean }
      join_vehicle_by_code: { Args: { code: string }; Returns: string }
      remove_vehicle_member: {
        Args: { target_user: string }
        Returns: undefined
      }
      reset_my_vehicle: { Args: never; Returns: string }
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
