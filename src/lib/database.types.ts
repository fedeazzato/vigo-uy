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
      car_battery_samples: {
        Row: {
          capacity_kwh: number | null
          client_id: string
          device_id: string | null
          end_soc: number
          ended_at: string
          energy_kwh: number
          id: string
          odometer_km: number | null
          received_at: string
          start_soc: number
          started_at: string
          temp_c: number | null
          vehicle_id: string
        }
        Insert: {
          capacity_kwh?: number | null
          client_id: string
          device_id?: string | null
          end_soc: number
          ended_at: string
          energy_kwh: number
          id?: string
          odometer_km?: number | null
          received_at?: string
          start_soc: number
          started_at: string
          temp_c?: number | null
          vehicle_id: string
        }
        Update: {
          capacity_kwh?: number | null
          client_id?: string
          device_id?: string | null
          end_soc?: number
          ended_at?: string
          energy_kwh?: number
          id?: string
          odometer_km?: number | null
          received_at?: string
          start_soc?: number
          started_at?: string
          temp_c?: number | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "car_battery_samples_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "car_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "car_battery_samples_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicle_km_leaderboard"
            referencedColumns: ["vehicle_id"]
          },
          {
            foreignKeyName: "car_battery_samples_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      car_charge_drafts: {
        Row: {
          avg_kw: number | null
          charging_min: number | null
          client_id: string
          device_id: string | null
          distance_m: number
          end_reason: string | null
          end_soc: number | null
          ended_at: string
          energy_kwh: number | null
          id: string
          max_kw: number | null
          received_at: string
          report_id: string | null
          result: string
          start_soc: number | null
          started_at: string
          station_id: string
          status: string
          vehicle_id: string
        }
        Insert: {
          avg_kw?: number | null
          charging_min?: number | null
          client_id: string
          device_id?: string | null
          distance_m: number
          end_reason?: string | null
          end_soc?: number | null
          ended_at: string
          energy_kwh?: number | null
          id?: string
          max_kw?: number | null
          received_at?: string
          report_id?: string | null
          result: string
          start_soc?: number | null
          started_at: string
          station_id: string
          status?: string
          vehicle_id: string
        }
        Update: {
          avg_kw?: number | null
          charging_min?: number | null
          client_id?: string
          device_id?: string | null
          distance_m?: number
          end_reason?: string | null
          end_soc?: number | null
          ended_at?: string
          energy_kwh?: number | null
          id?: string
          max_kw?: number | null
          received_at?: string
          report_id?: string | null
          result?: string
          start_soc?: number | null
          started_at?: string
          station_id?: string
          status?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "car_charge_drafts_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "car_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "car_charge_drafts_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "station_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "car_charge_drafts_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "charging_stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "car_charge_drafts_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicle_km_leaderboard"
            referencedColumns: ["vehicle_id"]
          },
          {
            foreignKeyName: "car_charge_drafts_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      car_devices: {
        Row: {
          app_version: string | null
          created_at: string
          created_by: string | null
          id: string
          last_request_ts: number
          last_seen_at: string | null
          name: string
          poll_window_count: number
          poll_window_started_at: string | null
          public_key: string
          revoked_at: string | null
          revoked_by: string | null
          vehicle_id: string
          window_count: number
          window_started_at: string | null
        }
        Insert: {
          app_version?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          last_request_ts?: number
          last_seen_at?: string | null
          name: string
          poll_window_count?: number
          poll_window_started_at?: string | null
          public_key: string
          revoked_at?: string | null
          revoked_by?: string | null
          vehicle_id: string
          window_count?: number
          window_started_at?: string | null
        }
        Update: {
          app_version?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          last_request_ts?: number
          last_seen_at?: string | null
          name?: string
          poll_window_count?: number
          poll_window_started_at?: string | null
          public_key?: string
          revoked_at?: string | null
          revoked_by?: string | null
          vehicle_id?: string
          window_count?: number
          window_started_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "car_devices_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicle_km_leaderboard"
            referencedColumns: ["vehicle_id"]
          },
          {
            foreignKeyName: "car_devices_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      car_diagnostic_parts: {
        Row: {
          data: string
          diagnostic_id: string
          part: number
        }
        Insert: {
          data: string
          diagnostic_id: string
          part: number
        }
        Update: {
          data?: string
          diagnostic_id?: string
          part?: number
        }
        Relationships: [
          {
            foreignKeyName: "car_diagnostic_parts_diagnostic_id_fkey"
            columns: ["diagnostic_id"]
            isOneToOne: false
            referencedRelation: "car_diagnostics"
            referencedColumns: ["id"]
          },
        ]
      }
      car_diagnostics: {
        Row: {
          apps: Json
          complete: boolean
          completed_at: string | null
          created_at: string
          device_id: string | null
          id: string
          note: string
          parts: number
          received: number
          vehicle_id: string
        }
        Insert: {
          apps?: Json
          complete?: boolean
          completed_at?: string | null
          created_at?: string
          device_id?: string | null
          id: string
          note?: string
          parts: number
          received?: number
          vehicle_id: string
        }
        Update: {
          apps?: Json
          complete?: boolean
          completed_at?: string | null
          created_at?: string
          device_id?: string | null
          id?: string
          note?: string
          parts?: number
          received?: number
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "car_diagnostics_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "car_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "car_diagnostics_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicle_km_leaderboard"
            referencedColumns: ["vehicle_id"]
          },
          {
            foreignKeyName: "car_diagnostics_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      car_drive_samples: {
        Row: {
          avg_speed_kmh: number | null
          brake_events: number | null
          client_id: string
          device_id: string | null
          distance_km: number
          ended_at: string
          energy_kwh: number | null
          id: string
          received_at: string
          regen_kwh: number | null
          regen_pct: number | null
          started_at: string
          temp_c: number | null
          vehicle_id: string
        }
        Insert: {
          avg_speed_kmh?: number | null
          brake_events?: number | null
          client_id: string
          device_id?: string | null
          distance_km: number
          ended_at: string
          energy_kwh?: number | null
          id?: string
          received_at?: string
          regen_kwh?: number | null
          regen_pct?: number | null
          started_at: string
          temp_c?: number | null
          vehicle_id: string
        }
        Update: {
          avg_speed_kmh?: number | null
          brake_events?: number | null
          client_id?: string
          device_id?: string | null
          distance_km?: number
          ended_at?: string
          energy_kwh?: number | null
          id?: string
          received_at?: string
          regen_kwh?: number | null
          regen_pct?: number | null
          started_at?: string
          temp_c?: number | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "car_drive_samples_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "car_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "car_drive_samples_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicle_km_leaderboard"
            referencedColumns: ["vehicle_id"]
          },
          {
            foreignKeyName: "car_drive_samples_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      car_fault_events: {
        Row: {
          client_id: string
          code: string
          device_id: string | null
          id: string
          observed_at: string
          odometer_km: number | null
          received_at: string
          source: string
          value: number
          vehicle_id: string
        }
        Insert: {
          client_id: string
          code: string
          device_id?: string | null
          id?: string
          observed_at: string
          odometer_km?: number | null
          received_at?: string
          source: string
          value: number
          vehicle_id: string
        }
        Update: {
          client_id?: string
          code?: string
          device_id?: string | null
          id?: string
          observed_at?: string
          odometer_km?: number | null
          received_at?: string
          source?: string
          value?: number
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "car_fault_events_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "car_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "car_fault_events_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicle_km_leaderboard"
            referencedColumns: ["vehicle_id"]
          },
          {
            foreignKeyName: "car_fault_events_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      car_location: {
        Row: {
          acc_m: number | null
          device_id: string | null
          kind: string | null
          lat: number | null
          lon: number | null
          mode: string
          observed_at: string | null
          received_at: string | null
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          acc_m?: number | null
          device_id?: string | null
          kind?: string | null
          lat?: number | null
          lon?: number | null
          mode: string
          observed_at?: string | null
          received_at?: string | null
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          acc_m?: number | null
          device_id?: string | null
          kind?: string | null
          lat?: number | null
          lon?: number | null
          mode?: string
          observed_at?: string | null
          received_at?: string | null
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "car_location_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "car_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "car_location_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: true
            referencedRelation: "vehicle_km_leaderboard"
            referencedColumns: ["vehicle_id"]
          },
          {
            foreignKeyName: "car_location_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: true
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      car_odometer_log: {
        Row: {
          anomaly: boolean
          day: string
          odometer_km: number
          vehicle_id: string
        }
        Insert: {
          anomaly?: boolean
          day: string
          odometer_km: number
          vehicle_id: string
        }
        Update: {
          anomaly?: boolean
          day?: string
          odometer_km?: number
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "car_odometer_log_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicle_km_leaderboard"
            referencedColumns: ["vehicle_id"]
          },
          {
            foreignKeyName: "car_odometer_log_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      car_orders: {
        Row: {
          args: Json
          created_at: string
          created_by: string | null
          device_id: string | null
          expires_at: string
          finished_at: string | null
          id: string
          kind: string
          result_code: string | null
          result_text: string | null
          state: string
          taken_at: string | null
          vehicle_id: string
        }
        Insert: {
          args?: Json
          created_at?: string
          created_by?: string | null
          device_id?: string | null
          expires_at?: string
          finished_at?: string | null
          id?: string
          kind: string
          result_code?: string | null
          result_text?: string | null
          state?: string
          taken_at?: string | null
          vehicle_id: string
        }
        Update: {
          args?: Json
          created_at?: string
          created_by?: string | null
          device_id?: string | null
          expires_at?: string
          finished_at?: string | null
          id?: string
          kind?: string
          result_code?: string | null
          result_text?: string | null
          state?: string
          taken_at?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "car_orders_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "car_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "car_orders_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicle_km_leaderboard"
            referencedColumns: ["vehicle_id"]
          },
          {
            foreignKeyName: "car_orders_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      car_pairing_attempts: {
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
      car_pairing_requests: {
        Row: {
          claimed_at: string | null
          claimed_by: string | null
          code: string
          created_at: string
          device_id: string | null
          device_name: string
          expires_at: string
          public_key: string
          vehicle_id: string | null
        }
        Insert: {
          claimed_at?: string | null
          claimed_by?: string | null
          code: string
          created_at?: string
          device_id?: string | null
          device_name: string
          expires_at: string
          public_key: string
          vehicle_id?: string | null
        }
        Update: {
          claimed_at?: string | null
          claimed_by?: string | null
          code?: string
          created_at?: string
          device_id?: string | null
          device_name?: string
          expires_at?: string
          public_key?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "car_pairing_requests_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "car_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "car_pairing_requests_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicle_km_leaderboard"
            referencedColumns: ["vehicle_id"]
          },
          {
            foreignKeyName: "car_pairing_requests_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      car_parking_spots: {
        Row: {
          acc_m: number | null
          id: number
          lat: number
          lon: number
          observed_at: string
          received_at: string
          vehicle_id: string
        }
        Insert: {
          acc_m?: number | null
          id?: never
          lat: number
          lon: number
          observed_at: string
          received_at?: string
          vehicle_id: string
        }
        Update: {
          acc_m?: number | null
          id?: never
          lat?: number
          lon?: number
          observed_at?: string
          received_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "car_parking_spots_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicle_km_leaderboard"
            referencedColumns: ["vehicle_id"]
          },
          {
            foreignKeyName: "car_parking_spots_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      car_release_publishers: {
        Row: {
          added_at: string
          user_id: string
        }
        Insert: {
          added_at?: string
          user_id: string
        }
        Update: {
          added_at?: string
          user_id?: string
        }
        Relationships: []
      }
      car_releases: {
        Row: {
          channel: string
          created_at: string
          created_by: string | null
          download_base: string
          expires_at: string
          id: string
          is_kill: boolean
          manifest: string
          note: string | null
          rollout_cap: number | null
          rollout_percent: number
          rollout_salt: string
          serial: number
          signature: string
        }
        Insert: {
          channel: string
          created_at?: string
          created_by?: string | null
          download_base: string
          expires_at: string
          id?: string
          is_kill: boolean
          manifest: string
          note?: string | null
          rollout_cap?: number | null
          rollout_percent: number
          rollout_salt: string
          serial: number
          signature: string
        }
        Update: {
          channel?: string
          created_at?: string
          created_by?: string | null
          download_base?: string
          expires_at?: string
          id?: string
          is_kill?: boolean
          manifest?: string
          note?: string | null
          rollout_cap?: number | null
          rollout_percent?: number
          rollout_salt?: string
          serial?: number
          signature?: string
        }
        Relationships: []
      }
      car_status: {
        Row: {
          charge_end_reason: string | null
          charging: boolean | null
          device_id: string | null
          event: string
          fw_version: string | null
          limit_pct: number | null
          observed_at: string
          odometer_km: number | null
          plugged: boolean | null
          range_km: number | null
          received_at: string
          remain_charge_min: number | null
          remote_on: boolean | null
          soc: number | null
          vehicle_id: string
        }
        Insert: {
          charge_end_reason?: string | null
          charging?: boolean | null
          device_id?: string | null
          event: string
          fw_version?: string | null
          limit_pct?: number | null
          observed_at: string
          odometer_km?: number | null
          plugged?: boolean | null
          range_km?: number | null
          received_at?: string
          remain_charge_min?: number | null
          remote_on?: boolean | null
          soc?: number | null
          vehicle_id: string
        }
        Update: {
          charge_end_reason?: string | null
          charging?: boolean | null
          device_id?: string | null
          event?: string
          fw_version?: string | null
          limit_pct?: number | null
          observed_at?: string
          odometer_km?: number | null
          plugged?: boolean | null
          range_km?: number | null
          received_at?: string
          remain_charge_min?: number | null
          remote_on?: boolean | null
          soc?: number | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "car_status_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "car_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "car_status_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: true
            referencedRelation: "vehicle_km_leaderboard"
            referencedColumns: ["vehicle_id"]
          },
          {
            foreignKeyName: "car_status_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: true
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      car_trip_drafts: {
        Row: {
          avg_speed_kmh: number | null
          charges: Json
          client_id: string
          device_id: string | null
          distance_km: number
          end_soc: number | null
          ended_at: string
          energy_kwh: number | null
          id: string
          received_at: string
          route: Json
          start_soc: number | null
          started_at: string
          status: string
          trip_count: number
          used_at: string | null
          vehicle_id: string
        }
        Insert: {
          avg_speed_kmh?: number | null
          charges?: Json
          client_id: string
          device_id?: string | null
          distance_km: number
          end_soc?: number | null
          ended_at: string
          energy_kwh?: number | null
          id?: string
          received_at?: string
          route?: Json
          start_soc?: number | null
          started_at: string
          status?: string
          trip_count: number
          used_at?: string | null
          vehicle_id: string
        }
        Update: {
          avg_speed_kmh?: number | null
          charges?: Json
          client_id?: string
          device_id?: string | null
          distance_km?: number
          end_soc?: number | null
          ended_at?: string
          energy_kwh?: number | null
          id?: string
          received_at?: string
          route?: Json
          start_soc?: number | null
          started_at?: string
          status?: string
          trip_count?: number
          used_at?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "car_trip_drafts_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "car_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "car_trip_drafts_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicle_km_leaderboard"
            referencedColumns: ["vehicle_id"]
          },
          {
            foreignKeyName: "car_trip_drafts_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      car_update_beta: {
        Row: {
          set_at: string
          set_by: string | null
          vehicle_id: string
        }
        Insert: {
          set_at?: string
          set_by?: string | null
          vehicle_id: string
        }
        Update: {
          set_at?: string
          set_by?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "car_update_beta_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: true
            referencedRelation: "vehicle_km_leaderboard"
            referencedColumns: ["vehicle_id"]
          },
          {
            foreignKeyName: "car_update_beta_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: true
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      car_update_status: {
        Row: {
          channel: string
          checked_at: string | null
          device_id: string | null
          firmware: string | null
          installed: Json
          last_line: string | null
          offered_serial: number | null
          phase: string | null
          reported_at: string | null
          serial: number | null
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          channel?: string
          checked_at?: string | null
          device_id?: string | null
          firmware?: string | null
          installed?: Json
          last_line?: string | null
          offered_serial?: number | null
          phase?: string | null
          reported_at?: string | null
          serial?: number | null
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          channel?: string
          checked_at?: string | null
          device_id?: string | null
          firmware?: string | null
          installed?: Json
          last_line?: string | null
          offered_serial?: number | null
          phase?: string | null
          reported_at?: string | null
          serial?: number | null
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "car_update_status_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "car_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "car_update_status_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: true
            referencedRelation: "vehicle_km_leaderboard"
            referencedColumns: ["vehicle_id"]
          },
          {
            foreignKeyName: "car_update_status_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: true
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
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
          lat: number
          lng: number
          max_power_kw: number | null
          name: string
          network: string
          ocm_id: number | null
          ocm_last_synced_at: string | null
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
          lat: number
          lng: number
          max_power_kw?: number | null
          name: string
          network: string
          ocm_id?: number | null
          ocm_last_synced_at?: string | null
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
          lat?: number
          lng?: number
          max_power_kw?: number | null
          name?: string
          network?: string
          ocm_id?: number | null
          ocm_last_synced_at?: string | null
          updated_at?: string
          user_id?: string
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "charging_stations_network_fkey"
            columns: ["network"]
            isOneToOne: false
            referencedRelation: "charging_networks"
            referencedColumns: ["slug"]
          },
        ]
      }
      content_comments: {
        Row: {
          body: string
          created_at: string
          id: string
          part_purchase_id: string | null
          service_entry_id: string | null
          trip_log_id: string | null
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          part_purchase_id?: string | null
          service_entry_id?: string | null
          trip_log_id?: string | null
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          part_purchase_id?: string | null
          service_entry_id?: string | null
          trip_log_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_comments_part_purchase_id_fkey"
            columns: ["part_purchase_id"]
            isOneToOne: false
            referencedRelation: "part_purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_comments_service_entry_id_fkey"
            columns: ["service_entry_id"]
            isOneToOne: false
            referencedRelation: "service_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_comments_trip_log_id_fkey"
            columns: ["trip_log_id"]
            isOneToOne: false
            referencedRelation: "trip_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      content_follows: {
        Row: {
          created_at: string
          id: string
          part_purchase_id: string | null
          service_entry_id: string | null
          station_id: string | null
          trip_log_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          part_purchase_id?: string | null
          service_entry_id?: string | null
          station_id?: string | null
          trip_log_id?: string | null
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          part_purchase_id?: string | null
          service_entry_id?: string | null
          station_id?: string | null
          trip_log_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_follows_part_purchase_id_fkey"
            columns: ["part_purchase_id"]
            isOneToOne: false
            referencedRelation: "part_purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_follows_service_entry_id_fkey"
            columns: ["service_entry_id"]
            isOneToOne: false
            referencedRelation: "service_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_follows_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "charging_stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_follows_trip_log_id_fkey"
            columns: ["trip_log_id"]
            isOneToOne: false
            referencedRelation: "trip_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      content_reactions: {
        Row: {
          created_at: string
          id: string
          part_purchase_id: string | null
          service_entry_id: string | null
          trip_log_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          part_purchase_id?: string | null
          service_entry_id?: string | null
          trip_log_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          part_purchase_id?: string | null
          service_entry_id?: string | null
          trip_log_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_reactions_part_purchase_id_fkey"
            columns: ["part_purchase_id"]
            isOneToOne: false
            referencedRelation: "part_purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_reactions_service_entry_id_fkey"
            columns: ["service_entry_id"]
            isOneToOne: false
            referencedRelation: "service_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_reactions_trip_log_id_fkey"
            columns: ["trip_log_id"]
            isOneToOne: false
            referencedRelation: "trip_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      insurance_addons: {
        Row: {
          badge_label: string
          checkbox_label: string
          created_at: string
          icon: string
          limit_kind: string
          slug: string
          sort_order: number
        }
        Insert: {
          badge_label: string
          checkbox_label: string
          created_at?: string
          icon: string
          limit_kind?: string
          slug: string
          sort_order?: number
        }
        Update: {
          badge_label?: string
          checkbox_label?: string
          created_at?: string
          icon?: string
          limit_kind?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      insurance_providers: {
        Row: {
          created_at: string
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      insurance_quote_addons: {
        Row: {
          addon: string
          limit_count: number | null
          limit_uyu: number | null
          quote_id: string
        }
        Insert: {
          addon: string
          limit_count?: number | null
          limit_uyu?: number | null
          quote_id: string
        }
        Update: {
          addon?: string
          limit_count?: number | null
          limit_uyu?: number | null
          quote_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "insurance_quote_addons_addon_fkey"
            columns: ["addon"]
            isOneToOne: false
            referencedRelation: "insurance_addons"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "insurance_quote_addons_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "insurance_quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      insurance_quotes: {
        Row: {
          average_driver_age: number
          cost_per_year_uyu: number | null
          coverage_level: string
          created_at: string
          deductible_uyu: number | null
          driver_count: number
          hidden: boolean
          hire_date: string
          id: string
          is_public: boolean
          notes: string | null
          period_years: number
          provider: string
          total_cost_uyu: number
          user_id: string
          vehicle_id: string | null
          verified: boolean
          zone: string
        }
        Insert: {
          average_driver_age: number
          cost_per_year_uyu?: number | null
          coverage_level: string
          created_at?: string
          deductible_uyu?: number | null
          driver_count: number
          hidden?: boolean
          hire_date: string
          id?: string
          is_public?: boolean
          notes?: string | null
          period_years: number
          provider: string
          total_cost_uyu: number
          user_id: string
          vehicle_id?: string | null
          verified?: boolean
          zone: string
        }
        Update: {
          average_driver_age?: number
          cost_per_year_uyu?: number | null
          coverage_level?: string
          created_at?: string
          deductible_uyu?: number | null
          driver_count?: number
          hidden?: boolean
          hire_date?: string
          id?: string
          is_public?: boolean
          notes?: string | null
          period_years?: number
          provider?: string
          total_cost_uyu?: number
          user_id?: string
          vehicle_id?: string | null
          verified?: boolean
          zone?: string
        }
        Relationships: [
          {
            foreignKeyName: "insurance_quotes_provider_fkey"
            columns: ["provider"]
            isOneToOne: false
            referencedRelation: "insurance_providers"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "insurance_quotes_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicle_km_leaderboard"
            referencedColumns: ["vehicle_id"]
          },
          {
            foreignKeyName: "insurance_quotes_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
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
      notifications: {
        Row: {
          actor_id: string | null
          created_at: string
          id: string
          kind: string
          part_purchase_id: string | null
          read_at: string | null
          service_entry_id: string | null
          station_id: string | null
          title: string
          trip_log_id: string | null
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          id?: string
          kind: string
          part_purchase_id?: string | null
          read_at?: string | null
          service_entry_id?: string | null
          station_id?: string | null
          title: string
          trip_log_id?: string | null
          user_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          part_purchase_id?: string | null
          read_at?: string | null
          service_entry_id?: string | null
          station_id?: string | null
          title?: string
          trip_log_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_part_purchase_id_fkey"
            columns: ["part_purchase_id"]
            isOneToOne: false
            referencedRelation: "part_purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_service_entry_id_fkey"
            columns: ["service_entry_id"]
            isOneToOne: false
            referencedRelation: "service_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "charging_stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_trip_log_id_fkey"
            columns: ["trip_log_id"]
            isOneToOne: false
            referencedRelation: "trip_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      ocm_rate_counters: {
        Row: {
          bucket: string
          hits: number
          window_start: string
        }
        Insert: {
          bucket: string
          hits?: number
          window_start: string
        }
        Update: {
          bucket?: string
          hits?: number
          window_start?: string
        }
        Relationships: []
      }
      ocm_tile_cache: {
        Row: {
          expires_at: string | null
          failed_at: string | null
          fetched_at: string | null
          lease_until: string | null
          payload: Json | null
          station_count: number
          tile_key: string
          truncated: boolean
          updated_at: string
        }
        Insert: {
          expires_at?: string | null
          failed_at?: string | null
          fetched_at?: string | null
          lease_until?: string | null
          payload?: Json | null
          station_count?: number
          tile_key: string
          truncated?: boolean
          updated_at?: string
        }
        Update: {
          expires_at?: string | null
          failed_at?: string | null
          fetched_at?: string | null
          lease_until?: string | null
          payload?: Json | null
          station_count?: number
          tile_key?: string
          truncated?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      ocm_upstream_state: {
        Row: {
          blocked_until: string | null
          id: number
          last_error: string | null
          updated_at: string
        }
        Insert: {
          blocked_until?: string | null
          id?: number
          last_error?: string | null
          updated_at?: string
        }
        Update: {
          blocked_until?: string | null
          id?: number
          last_error?: string | null
          updated_at?: string
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
          image_url: string | null
          is_public: boolean
          item: string
          link: string | null
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
          image_url?: string | null
          is_public?: boolean
          item: string
          link?: string | null
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
          image_url?: string | null
          is_public?: boolean
          item?: string
          link?: string | null
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
      route_plans: {
        Row: {
          consumption_kwh_100km: number
          created_at: string
          destination: string
          id: string
          min_arrival_soc: number
          model: string | null
          origin: string
          snapshot: Json
          start_soc: number
          title: string
          user_id: string
        }
        Insert: {
          consumption_kwh_100km: number
          created_at?: string
          destination: string
          id?: string
          min_arrival_soc: number
          model?: string | null
          origin: string
          snapshot?: Json
          start_soc: number
          title: string
          user_id?: string
        }
        Update: {
          consumption_kwh_100km?: number
          created_at?: string
          destination?: string
          id?: string
          min_arrival_soc?: number
          model?: string | null
          origin?: string
          snapshot?: Json
          start_soc?: number
          title?: string
          user_id?: string
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
      station_reports: {
        Row: {
          achieved_kw: number | null
          created_at: string
          duration_min: number | null
          energy_kwh: number | null
          from_car: boolean
          id: string
          note: string | null
          station_id: string
          status: string
          user_id: string
        }
        Insert: {
          achieved_kw?: number | null
          created_at?: string
          duration_min?: number | null
          energy_kwh?: number | null
          from_car?: boolean
          id?: string
          note?: string | null
          station_id: string
          status: string
          user_id: string
        }
        Update: {
          achieved_kw?: number | null
          created_at?: string
          duration_min?: number | null
          energy_kwh?: number | null
          from_car?: boolean
          id?: string
          note?: string | null
          station_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "station_reports_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "charging_stations"
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
      vault_inbox: {
        Row: {
          ciphertext: string
          created_at: string
          device_id: string | null
          epk: string
          id: string
          iv: string
          key_id: string
          kind: string
          user_id: string
        }
        Insert: {
          ciphertext: string
          created_at?: string
          device_id?: string | null
          epk: string
          id?: string
          iv: string
          key_id: string
          kind: string
          user_id: string
        }
        Update: {
          ciphertext?: string
          created_at?: string
          device_id?: string | null
          epk?: string
          id?: string
          iv?: string
          key_id?: string
          kind?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vault_inbox_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "car_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      vault_inbox_keys: {
        Row: {
          created_at: string
          key_id: string
          public_key: string
          user_id: string
        }
        Insert: {
          created_at?: string
          key_id?: string
          public_key: string
          user_id?: string
        }
        Update: {
          created_at?: string
          key_id?: string
          public_key?: string
          user_id?: string
        }
        Relationships: []
      }
      vault_items: {
        Row: {
          ciphertext: string
          iv: string
          kind: string
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          ciphertext: string
          iv: string
          kind: string
          updated_at?: string
          user_id?: string
          version?: number
        }
        Update: {
          ciphertext?: string
          iv?: string
          kind?: string
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: []
      }
      vault_keys: {
        Row: {
          created_at: string
          credential_id: string
          label: string
          prf_salt: string
          user_id: string
          wrapped_dk: string
        }
        Insert: {
          created_at?: string
          credential_id: string
          label: string
          prf_salt: string
          user_id?: string
          wrapped_dk: string
        }
        Update: {
          created_at?: string
          credential_id?: string
          label?: string
          prf_salt?: string
          user_id?: string
          wrapped_dk?: string
        }
        Relationships: []
      }
      vault_write_log: {
        Row: {
          at: string
          user_id: string
        }
        Insert: {
          at?: string
          user_id: string
        }
        Update: {
          at?: string
          user_id?: string
        }
        Relationships: []
      }
      vehicle_config_snapshots: {
        Row: {
          config_head: string
          config_tail: string
          created_at: string
          firmware: string | null
          id: string
          items: Json
          label: string
          taken_at: string
          user_id: string
        }
        Insert: {
          config_head: string
          config_tail: string
          created_at?: string
          firmware?: string | null
          id?: string
          items?: Json
          label: string
          taken_at: string
          user_id?: string
        }
        Update: {
          config_head?: string
          config_tail?: string
          created_at?: string
          firmware?: string | null
          id?: string
          items?: Json
          label?: string
          taken_at?: string
          user_id?: string
        }
        Relationships: []
      }
      vehicle_data_sharing: {
        Row: {
          battery_community: boolean
          consumption_atlas: boolean
          eco_league: boolean
          fault_matching: boolean
          updated_at: string
          updated_by: string | null
          vehicle_id: string
          verified_km_public: boolean
        }
        Insert: {
          battery_community?: boolean
          consumption_atlas?: boolean
          eco_league?: boolean
          fault_matching?: boolean
          updated_at?: string
          updated_by?: string | null
          vehicle_id: string
          verified_km_public?: boolean
        }
        Update: {
          battery_community?: boolean
          consumption_atlas?: boolean
          eco_league?: boolean
          fault_matching?: boolean
          updated_at?: string
          updated_by?: string | null
          vehicle_id?: string
          verified_km_public?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_data_sharing_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: true
            referencedRelation: "vehicle_km_leaderboard"
            referencedColumns: ["vehicle_id"]
          },
          {
            foreignKeyName: "vehicle_data_sharing_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: true
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_invites: {
        Row: {
          code_hash: string
          created_at: string
          created_by: string
          expires_at: string
          id: string
          used_at: string | null
          used_by: string | null
          vehicle_id: string
        }
        Insert: {
          code_hash: string
          created_at?: string
          created_by: string
          expires_at: string
          id?: string
          used_at?: string | null
          used_by?: string | null
          vehicle_id: string
        }
        Update: {
          code_hash?: string
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          used_at?: string | null
          used_by?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_invites_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicle_km_leaderboard"
            referencedColumns: ["vehicle_id"]
          },
          {
            foreignKeyName: "vehicle_invites_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_members: {
        Row: {
          car_role: string
          joined_at: string
          user_id: string
          vehicle_id: string
        }
        Insert: {
          car_role?: string
          joined_at?: string
          user_id: string
          vehicle_id: string
        }
        Update: {
          car_role?: string
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
          join_code: string | null
          model: string | null
          plate: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          join_code?: string | null
          model?: string | null
          plate?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          join_code?: string | null
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
            foreignKeyName: "charging_stations_network_fkey"
            columns: ["network"]
            isOneToOne: false
            referencedRelation: "charging_networks"
            referencedColumns: ["slug"]
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
      content_reaction_counts: {
        Row: {
          like_count: number | null
          part_purchase_id: string | null
          service_entry_id: string | null
          trip_log_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_reactions_part_purchase_id_fkey"
            columns: ["part_purchase_id"]
            isOneToOne: false
            referencedRelation: "part_purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_reactions_service_entry_id_fkey"
            columns: ["service_entry_id"]
            isOneToOne: false
            referencedRelation: "service_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_reactions_trip_log_id_fkey"
            columns: ["trip_log_id"]
            isOneToOne: false
            referencedRelation: "trip_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      insurance_cost_stats: {
        Row: {
          avg_cost_per_year_uyu: number | null
          coverage_level: string | null
          provider: string | null
          sample_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "insurance_quotes_provider_fkey"
            columns: ["provider"]
            isOneToOne: false
            referencedRelation: "insurance_providers"
            referencedColumns: ["slug"]
          },
        ]
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
            foreignKeyName: "station_reports_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "charging_stations"
            referencedColumns: ["id"]
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
      admin_decide_car_beta_request: {
        Args: { p_approve: boolean; p_request: string }
        Returns: undefined
      }
      admin_list_car_beta_requests: {
        Args: never
        Returns: {
          beta: boolean
          created_at: string
          id: string
          linked: boolean
          members: string
          requested_by_name: string
          vehicle_id: string
        }[]
      }
      admin_list_car_updates: {
        Args: never
        Returns: {
          beta: boolean
          channel: string
          checked_at: string
          firmware: string
          installed: Json
          last_line: string
          members: string
          offered_serial: number
          phase: string
          reported_at: string
          serial: number
          vehicle_id: string
        }[]
      }
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
      admin_publish_car_release: {
        Args: {
          p_channel: string
          p_download_base: string
          p_manifest: string
          p_note?: string
          p_signature: string
        }
        Returns: string
      }
      admin_set_car_beta: {
        Args: { p_beta: boolean; p_vehicle: string }
        Returns: undefined
      }
      admin_set_car_release_cap: {
        Args: { p_cap: number; p_release: string }
        Returns: undefined
      }
      admin_set_user_banned: {
        Args: { banned: boolean; target_user: string }
        Returns: undefined
      }
      admin_set_user_moderator: {
        Args: { make_moderator: boolean; target_user: string }
        Returns: undefined
      }
      admin0059_publish_car_release: {
        Args: {
          p_channel: string
          p_download_base: string
          p_manifest: string
          p_note?: string
          p_signature: string
        }
        Returns: string
      }
      admin0059_set_car_beta: {
        Args: { p_beta: boolean; p_vehicle: string }
        Returns: undefined
      }
      admin0059_set_car_release_cap: {
        Args: { p_cap: number; p_release: string }
        Returns: undefined
      }
      assert_moderator: { Args: never; Returns: undefined }
      battery_health_community: {
        Args: never
        Returns: {
          km_band: number
          median_capacity_kwh: number
          model: string
          vehicles: number
        }[]
      }
      can_control_car: { Args: { p_vehicle_id: string }; Returns: boolean }
      can_read_car_diagnostic: {
        Args: { p_vehicle_id: string }
        Returns: boolean
      }
      cancel_car_order: { Args: { p_id: string }; Returns: Json }
      car_clean_text: { Args: { max_len: number; t: string }; Returns: string }
      car_device_accept: {
        Args: { p_device_id: string; p_kind?: string; p_ts: number }
        Returns: Record<string, unknown>
      }
      car_device_public_key: { Args: { p_device_id: string }; Returns: string }
      car_diagnostic_vehicle_labels: {
        Args: { p_ids: string[] }
        Returns: {
          member_names: string[]
          vehicle_id: string
        }[]
      }
      car_firmware_versions: {
        Args: never
        Returns: {
          cars: number
          fw_version: string
          last_seen_month: string
        }[]
      }
      car_heartbeat: {
        Args: { p_app_version?: string; p_device_id: string; p_ts: number }
        Returns: Json
      }
      car_manifest_header: {
        Args: { p_manifest: string }
        Returns: {
          expires: number
          is_kill: boolean
          rollout_percent: number
          rollout_salt: string
          serial: number
        }[]
      }
      car_navigate_args_ok: { Args: { p_args: Json }; Returns: boolean }
      car_order_result: {
        Args: {
          p_code: string
          p_device_id: string
          p_id: string
          p_state: string
          p_text: string
          p_ts: number
        }
        Returns: Json
      }
      car_order_sender: { Args: { p_display_name: string }; Returns: string }
      car_orders_expire: { Args: { p_vehicle_id: string }; Returns: undefined }
      car_poll_orders: {
        Args: { p_device_id: string; p_live: Json; p_ts: number }
        Returns: Json
      }
      car_release_notes: {
        Args: { p_limit?: number }
        Returns: {
          apps: Json
          note: string
          notices: Json
          published_at: string
          serial: number
        }[]
      }
      car_store_status: {
        Args: {
          p_device_id: string
          p_live: boolean
          p_status: Json
          p_vehicle_id: string
        }
        Returns: Json
      }
      car_submit_charge_draft: {
        Args: { p_device_id: string; p_draft: Json; p_ts: number }
        Returns: Json
      }
      car_submit_data: {
        Args: { p_device_id: string; p_draft: Json; p_ts: number }
        Returns: Json
      }
      car_submit_diag_part: {
        Args: {
          p_apps: Json
          p_data: string
          p_device_id: string
          p_note: string
          p_part: number
          p_parts: number
          p_ts: number
          p_upload_id: string
        }
        Returns: Json
      }
      car_submit_location: {
        Args: {
          p_device_id: string
          p_mode: string
          p_point: Json
          p_ts: number
        }
        Returns: Json
      }
      car_submit_status: {
        Args: { p_device_id: string; p_status: Json; p_ts: number }
        Returns: Json
      }
      car_submit_trip_draft: {
        Args: { p_device_id: string; p_draft: Json; p_ts: number }
        Returns: Json
      }
      car_unpair: { Args: { p_device_id: string; p_ts: number }; Returns: Json }
      car_update_check: {
        Args: { p_device_id: string; p_report: Json; p_ts: number }
        Returns: Json
      }
      car_update_notices: {
        Args: never
        Returns: {
          label: string
          package: string
          version_code: number
        }[]
      }
      car_update_offered: {
        Args: { p_device_id: string; p_serial: number }
        Returns: undefined
      }
      car_update_report: {
        Args: {
          p_device_id: string
          p_last: string
          p_phase: string
          p_serial: number
          p_ts: number
        }
        Returns: Json
      }
      car_vault_inbox_key: {
        Args: { p_device_id: string; p_ts: number }
        Returns: Json
      }
      car_vault_inbox_put: {
        Args: {
          p_ciphertext: string
          p_device_id: string
          p_epk: string
          p_iv: string
          p_key_id: string
          p_kind: string
          p_ts: number
        }
        Returns: Json
      }
      car_vault_recipient: { Args: { p_device_id: string }; Returns: string }
      car_vehicle_member_names: {
        Args: { p_vehicle_id: string }
        Returns: Json
      }
      claim_car_pairing: {
        Args: { p_code: string; p_name?: string }
        Returns: Json
      }
      cleanup_orphan_vehicle: { Args: { v_id: string }; Returns: undefined }
      confirm_car_charge_draft: {
        Args: { p_id: string; p_note?: string; p_status?: string }
        Returns: string
      }
      consumption_atlas: {
        Args: never
        Returns: {
          bucket: string
          dimension: string
          km: number
          kwh_per_100km: number
          trips: number
          vehicles: number
        }[]
      }
      content_target: {
        Args: { p_purchase: string; p_service: string; p_trip: string }
        Returns: Record<string, unknown>
      }
      create_car_order: {
        Args: { p_args: Json; p_kind: string }
        Returns: Json
      }
      create_family_invite: {
        Args: never
        Returns: {
          code: string
          expires_at: string
        }[]
      }
      current_user_vehicle_id: { Args: never; Returns: string }
      delete_my_car_data: { Args: { p_kind: string }; Returns: number }
      eco_league: {
        Args: { p_month?: string }
        Returns: {
          km: number
          member_names: string[]
          regen_kwh: number
          regen_pct: number
          trips: number
          vehicle_id: string
        }[]
      }
      family_invite_hash: { Args: { p_code: string }; Returns: string }
      fault_code_counts: {
        Args: never
        Returns: {
          code: string
          source: string
          vehicles: number
        }[]
      }
      generate_car_pairing_code: { Args: never; Returns: string }
      generate_family_invite_code: { Args: never; Returns: string }
      generate_join_code: { Args: never; Returns: string }
      get_car_location: { Args: never; Returns: Json }
      is_active_moderator: { Args: { uid: string }; Returns: boolean }
      is_car_release_publisher: { Args: { uid: string }; Returns: boolean }
      is_p256_spki: { Args: { k: string }; Returns: boolean }
      is_user_banned: { Args: { uid: string }; Returns: boolean }
      join_vehicle_by_code: { Args: { code: string }; Returns: string }
      leave_car_beta: { Args: never; Returns: undefined }
      mark_notifications_read: {
        Args: { p_ids?: string[] }
        Returns: undefined
      }
      my_car_beta: { Args: never; Returns: Json }
      my_car_role: { Args: never; Returns: string }
      ocm_tiles_begin: {
        Args: { p_can_fetch?: boolean; p_client: string; p_tiles: string[] }
        Returns: Json
      }
      ocm_tiles_fail: {
        Args: { p_keys: string[]; p_reason: string }
        Returns: undefined
      }
      ocm_tiles_store: { Args: { p_tiles: Json }; Returns: number }
      poll_car_pairing: { Args: { p_code: string }; Returns: Json }
      remove_vehicle_member: {
        Args: { target_user: string }
        Returns: undefined
      }
      request_car_beta: { Args: never; Returns: string }
      request_car_pairing: {
        Args: { p_device_name?: string; p_public_key: string }
        Returns: Json
      }
      reset_my_vehicle: { Args: never; Returns: string }
      revoke_car_device: { Args: { p_device_id: string }; Returns: undefined }
      search_community_content: {
        Args: { result_limit?: number; search_query: string }
        Returns: {
          category: string
          created_at: string
          id: string
          kind: string
          rank: number
          subtitle: string
          title: string
        }[]
      }
      set_vehicle_data_sharing: {
        Args: { p_key: string; p_on: boolean }
        Returns: undefined
      }
      set_vehicle_member_role: {
        Args: { p_role: string; p_user: string }
        Returns: undefined
      }
      unaccent: { Args: { "": string }; Returns: string }
      vehicle_member_names: { Args: { p_vehicle: string }; Returns: string[] }
      vehicle_shares: {
        Args: { p_key: string; p_vehicle: string }
        Returns: boolean
      }
      verified_km_leaderboard: {
        Args: never
        Returns: {
          km_verified: number
          member_names: string[]
          odometer_km: number
          vehicle_id: string
          verified_since: string
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
