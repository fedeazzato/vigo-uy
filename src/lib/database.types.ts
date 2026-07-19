export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.5'
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
      charging_networks: {
        Row: {
          country: string
          created_at: string
          instructions: string | null
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          country: string
          created_at?: string
          instructions?: string | null
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          country?: string
          created_at?: string
          instructions?: string | null
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      charging_stations: {
        Row: {
          access_notes: string | null
          address: string | null
          city: string | null
          connector: string
          created_at: string
          current_type: string
          hidden: boolean
          id: string
          lat: number | null
          lng: number | null
          max_power_kw: number | null
          name: string
          network: string
          updated_at: string
          user_id: string
          verified: boolean
        }
        Insert: {
          access_notes?: string | null
          address?: string | null
          city?: string | null
          connector: string
          created_at?: string
          current_type: string
          hidden?: boolean
          id?: string
          lat?: number | null
          lng?: number | null
          max_power_kw?: number | null
          name: string
          network: string
          updated_at?: string
          user_id: string
          verified?: boolean
        }
        Update: {
          access_notes?: string | null
          address?: string | null
          city?: string | null
          connector?: string
          created_at?: string
          current_type?: string
          hidden?: boolean
          id?: string
          lat?: number | null
          lng?: number | null
          max_power_kw?: number | null
          name?: string
          network?: string
          updated_at?: string
          user_id?: string
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: 'charging_stations_network_fkey'
            columns: ['network']
            isOneToOne: false
            referencedRelation: 'charging_networks'
            referencedColumns: ['slug']
          },
        ]
      }
      join_code_attempts: {
        Row: {
          attempted_at: string
          user_id: string
        }
        Insert: {
          attempted_at?: string
          user_id: string
        }
        Update: {
          attempted_at?: string
          user_id?: string
        }
        Relationships: []
      }
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
          verified: boolean
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
          verified?: boolean
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
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: 'part_purchases_vehicle_id_fkey'
            columns: ['vehicle_id']
            isOneToOne: false
            referencedRelation: 'vehicle_km_leaderboard'
            referencedColumns: ['vehicle_id']
          },
          {
            foreignKeyName: 'part_purchases_vehicle_id_fkey'
            columns: ['vehicle_id']
            isOneToOne: false
            referencedRelation: 'vehicles'
            referencedColumns: ['id']
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
          verified: boolean
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
          verified?: boolean
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
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: 'service_entries_vehicle_id_fkey'
            columns: ['vehicle_id']
            isOneToOne: false
            referencedRelation: 'vehicle_km_leaderboard'
            referencedColumns: ['vehicle_id']
          },
          {
            foreignKeyName: 'service_entries_vehicle_id_fkey'
            columns: ['vehicle_id']
            isOneToOne: false
            referencedRelation: 'vehicles'
            referencedColumns: ['id']
          },
        ]
      }
      station_reports: {
        Row: {
          achieved_kw: number | null
          created_at: string
          id: string
          note: string | null
          station_id: string
          status: string
          user_id: string
        }
        Insert: {
          achieved_kw?: number | null
          created_at?: string
          id?: string
          note?: string | null
          station_id: string
          status: string
          user_id: string
        }
        Update: {
          achieved_kw?: number | null
          created_at?: string
          id?: string
          note?: string | null
          station_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'station_reports_station_id_fkey'
            columns: ['station_id']
            isOneToOne: false
            referencedRelation: 'charging_stations'
            referencedColumns: ['id']
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
          verified: boolean
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
          verified?: boolean
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
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: 'trip_logs_vehicle_id_fkey'
            columns: ['vehicle_id']
            isOneToOne: false
            referencedRelation: 'vehicle_km_leaderboard'
            referencedColumns: ['vehicle_id']
          },
          {
            foreignKeyName: 'trip_logs_vehicle_id_fkey'
            columns: ['vehicle_id']
            isOneToOne: false
            referencedRelation: 'vehicles'
            referencedColumns: ['id']
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
            foreignKeyName: 'vehicle_members_vehicle_id_fkey'
            columns: ['vehicle_id']
            isOneToOne: false
            referencedRelation: 'vehicle_km_leaderboard'
            referencedColumns: ['vehicle_id']
          },
          {
            foreignKeyName: 'vehicle_members_vehicle_id_fkey'
            columns: ['vehicle_id']
            isOneToOne: false
            referencedRelation: 'vehicles'
            referencedColumns: ['id']
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
      charging_cost_stats: {
        Row: {
          avg_cost_per_kwh: number | null
          network: string | null
          sample_count: number | null
          station_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'charging_stations_network_fkey'
            columns: ['network']
            isOneToOne: false
            referencedRelation: 'charging_networks'
            referencedColumns: ['slug']
          },
        ]
      }
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
      station_reliability: {
        Row: {
          failure_count: number | null
          failure_ratio: number | null
          last_report_at: string | null
          report_count: number | null
          station_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'station_reports_station_id_fkey'
            columns: ['station_id']
            isOneToOne: false
            referencedRelation: 'charging_stations'
            referencedColumns: ['id']
          },
        ]
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
      is_active_moderator: { Args: { uid: string }; Returns: boolean }
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

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    keyof (DefaultSchema['Tables'] & DefaultSchema['Views']) | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
