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
    PostgrestVersion: "14.15"
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
      bridge_players: {
        Row: {
          id: string
          name: string
          normalized_name: string
        }
        Insert: {
          id?: string
          name: string
          normalized_name: string
        }
        Update: {
          id?: string
          name?: string
          normalized_name?: string
        }
        Relationships: []
      }
      competitions: {
        Row: {
          country: string
          id: number
          is_active: boolean
          logo_url: string | null
          name: string
          season: number
        }
        Insert: {
          country: string
          id: number
          is_active?: boolean
          logo_url?: string | null
          name: string
          season: number
        }
        Update: {
          country?: string
          id?: number
          is_active?: boolean
          logo_url?: string | null
          name?: string
          season?: number
        }
        Relationships: []
      }
      daily_puzzles: {
        Row: {
          club_a: string
          club_b: string
          created_at: string
          id: string
          play_date: string
          valid_answers: Json
        }
        Insert: {
          club_a: string
          club_b: string
          created_at?: string
          id?: string
          play_date: string
          valid_answers: Json
        }
        Update: {
          club_a?: string
          club_b?: string
          created_at?: string
          id?: string
          play_date?: string
          valid_answers?: Json
        }
        Relationships: []
      }
      games: {
        Row: {
          away_logo: string | null
          away_team: string
          competition_id: number
          fixture_id: number
          home_logo: string | null
          home_team: string
          id: string
          kickoff_at: string
          live_updated_at: string | null
          minute: number | null
          score_away: number | null
          score_home: number | null
          settled_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          away_logo?: string | null
          away_team: string
          competition_id: number
          fixture_id: number
          home_logo?: string | null
          home_team: string
          id?: string
          kickoff_at: string
          live_updated_at?: string | null
          minute?: number | null
          score_away?: number | null
          score_home?: number | null
          settled_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          away_logo?: string | null
          away_team?: string
          competition_id?: number
          fixture_id?: number
          home_logo?: string | null
          home_team?: string
          id?: string
          kickoff_at?: string
          live_updated_at?: string | null
          minute?: number | null
          score_away?: number | null
          score_home?: number | null
          settled_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "games_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
        ]
      }
      league_members: {
        Row: {
          id: string
          joined_at: string
          league_id: string
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          league_id: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          league_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_members_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leagues: {
        Row: {
          competition_id: number
          created_at: string
          creator_id: string | null
          description: string | null
          featured_bonus_pct: number
          featured_game_id: string | null
          id: string
          invite_code: string
          is_public: boolean
          name: string
          prize_note: string | null
          prizes: Json | null
          status: string
        }
        Insert: {
          competition_id: number
          created_at?: string
          creator_id?: string | null
          description?: string | null
          featured_bonus_pct?: number
          featured_game_id?: string | null
          id?: string
          invite_code: string
          is_public?: boolean
          name: string
          prize_note?: string | null
          prizes?: Json | null
          status?: string
        }
        Update: {
          competition_id?: number
          created_at?: string
          creator_id?: string | null
          description?: string | null
          featured_bonus_pct?: number
          featured_game_id?: string | null
          id?: string
          invite_code?: string
          is_public?: boolean
          name?: string
          prize_note?: string | null
          prizes?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "leagues_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leagues_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leagues_featured_game_id_fkey"
            columns: ["featured_game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          link_url: string | null
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          link_url?: string | null
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          link_url?: string | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      predictions: {
        Row: {
          bonus_pct: number
          cancelled_at: string | null
          exact_score: string | null
          id: string
          odds: number
          odds_provisional: boolean
          points_earned: number | null
          predicted_at: string
          question_id: string
          selected_outcome: string
          settled_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          bonus_pct?: number
          cancelled_at?: string | null
          exact_score?: string | null
          id?: string
          odds: number
          odds_provisional?: boolean
          points_earned?: number | null
          predicted_at?: string
          question_id: string
          selected_outcome: string
          settled_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          bonus_pct?: number
          cancelled_at?: string | null
          exact_score?: string | null
          id?: string
          odds?: number
          odds_provisional?: boolean
          points_earned?: number | null
          predicted_at?: string
          question_id?: string
          selected_outcome?: string
          settled_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "predictions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "predictions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          is_site_admin: boolean
          total_correct: number
          total_points: number
          total_predictions: number
          updated_at: string
          username: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          is_site_admin?: boolean
          total_correct?: number
          total_points?: number
          total_predictions?: number
          updated_at?: string
          username: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          is_site_admin?: boolean
          total_correct?: number
          total_points?: number
          total_predictions?: number
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      puzzle_attempts: {
        Row: {
          answer: string
          attempt_number: number
          created_at: string
          id: string
          is_correct: boolean
          points_earned: number
          puzzle_id: string
          user_id: string
        }
        Insert: {
          answer: string
          attempt_number: number
          created_at?: string
          id?: string
          is_correct: boolean
          points_earned?: number
          puzzle_id: string
          user_id: string
        }
        Update: {
          answer?: string
          attempt_number?: number
          created_at?: string
          id?: string
          is_correct?: boolean
          points_earned?: number
          puzzle_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "puzzle_attempts_puzzle_id_fkey"
            columns: ["puzzle_id"]
            isOneToOne: false
            referencedRelation: "daily_puzzles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "puzzle_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          correct_outcome: string | null
          created_at: string
          game_id: string
          id: string
          odds_provisional: boolean
          outcomes: Json
          resolved_at: string | null
          type: string
        }
        Insert: {
          correct_outcome?: string | null
          created_at?: string
          game_id: string
          id?: string
          odds_provisional?: boolean
          outcomes: Json
          resolved_at?: string | null
          type: string
        }
        Update: {
          correct_outcome?: string | null
          created_at?: string
          game_id?: string
          id?: string
          odds_provisional?: boolean
          outcomes?: Json
          resolved_at?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "questions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      user_achievements: {
        Row: {
          achievement_key: string
          earned_at: string
          id: string
          user_id: string
        }
        Insert: {
          achievement_key: string
          earned_at?: string
          id?: string
          user_id: string
        }
        Update: {
          achievement_key?: string
          earned_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_achievements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_delete_user: { Args: { p_user_id: string }; Returns: undefined }
      admin_list_games: {
        Args: {
          p_competition?: number | null
          p_limit?: number
          p_offset?: number
          p_search?: string | null
          p_status?: string
        }
        Returns: {
          away_team: string
          competition_id: number
          competition_name: string
          fixture_id: number
          home_team: string
          id: string
          kickoff_at: string
          player_count: number
          prediction_count: number
          question_count: number
          score_away: number | null
          score_home: number | null
          settled_at: string | null
          status: string
        }[]
      }
      admin_list_leagues: {
        Args: { p_limit?: number; p_offset?: number; p_search?: string | null }
        Returns: {
          competition_name: string
          created_at: string
          creator_id: string | null
          creator_name: string | null
          id: string
          invite_code: string
          is_public: boolean
          member_count: number
          name: string
          status: string
        }[]
      }
      admin_list_users: {
        Args: { p_limit?: number; p_offset?: number; p_search?: string | null }
        Returns: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          is_site_admin: boolean
          last_prediction_at: string | null
          leagues_count: number
          total_correct: number
          total_points: number
          total_predictions: number
          username: string
        }[]
      }
      admin_overview: {
        Args: never
        Returns: {
          games_awaiting: number
          games_live: number
          games_total: number
          games_upcoming: number
          leagues_archived: number
          leagues_private: number
          leagues_total: number
          members_private: number
          points_awarded: number
          predictions_correct: number
          predictions_incorrect: number
          predictions_pending: number
          predictions_total: number
          puzzle_attempts_today: number
          users_new_30d: number
          users_new_today: number
          users_total: number
        }[]
      }
      admin_set_site_admin: {
        Args: { p_user_id: string; p_value: boolean }
        Returns: undefined
      }
      admin_settle_game: {
        Args: { p_game_id: string; p_score_away: number; p_score_home: number }
        Returns: undefined
      }
      admin_user_detail: {
        Args: { p_user_id: string }
        Returns: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          is_site_admin: boolean
          last_prediction_at: string | null
          leagues_count: number
          total_correct: number
          total_points: number
          total_predictions: number
          username: string
        }[]
      }
      admin_user_leagues: {
        Args: { p_user_id: string }
        Returns: {
          id: string
          is_creator: boolean
          is_public: boolean
          joined_at: string
          name: string
          status: string
        }[]
      }
      admin_user_predictions: {
        Args: { p_limit?: number; p_user_id: string }
        Returns: {
          away_team: string
          bonus_pct: number
          correct_outcome: string | null
          exact_score: string | null
          game_id: string
          home_team: string
          id: string
          kickoff_at: string
          odds: number
          points_earned: number | null
          predicted_at: string
          question_type: string
          selected_outcome: string
          status: string
        }[]
      }
      best_league_rank: { Args: { p_user: string }; Returns: number }
      cancel_prediction: { Args: { p_id: string }; Returns: undefined }
      create_league: {
        Args: {
          p_competition_id: number
          p_description?: string
          p_name: string
        }
        Returns: {
          league_code: string
          league_id: string
        }[]
      }
      generate_invite_code: { Args: never; Returns: string }
      get_global_leaderboard: {
        Args: { p_limit: number; p_offset: number }
        Returns: {
          avatar_url: string
          display_name: string
          total_points: number
        }[]
      }
      is_league_member: { Args: { p_league_id: string }; Returns: boolean }
      is_site_admin: { Args: never; Returns: boolean }
      join_league: { Args: { p_invite_code: string }; Returns: string }
      landing_fixtures: {
        Args: never
        Returns: {
          away_logo: string | null
          away_team: string
          competition_name: string
          home_logo: string | null
          home_team: string
          kickoff_at: string
          minute: number | null
          odds_provisional: boolean
          outcomes: Json
          score_away: number | null
          score_home: number | null
          status: string
        }[]
      }
      league_live_predictions: {
        Args: { p_league_id: string }
        Returns: {
          bonus_pct: number
          current_odds: number | null
          exact_score: string | null
          odds: number
          odds_provisional: boolean
          question_type: string
          score_away: number
          score_home: number
          selected_outcome: string
          user_id: string
        }[]
      }
      league_standings: {
        Args: { p_league_id: string; p_limit?: number; p_offset?: number }
        Returns: {
          avatar_url: string
          correct_count: number
          display_name: string
          joined_at: string
          points: number
          user_id: string
        }[]
      }
      settle_game_manually: {
        Args: {
          p_game_id: string
          p_league_id: string
          p_score_away: number
          p_score_home: number
        }
        Returns: undefined
      }
      shares_league_with: { Args: { p_user_id: string }; Returns: boolean }
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
