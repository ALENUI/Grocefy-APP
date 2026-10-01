export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      activity_log: {
        Row: {
          action: Database['public']['Enums']['activity_action'];
          actor_id: string | null;
          created_at: string;
          group_id: string | null;
          id: string;
          list_id: string | null;
          metadata: NonNullable<Json>;
          subject: string | null;
        };
        Insert: {
          action: Database['public']['Enums']['activity_action'];
          actor_id?: string | null;
          created_at?: string;
          group_id?: string | null;
          id?: string;
          list_id?: string | null;
          metadata?: NonNullable<Json>;
          subject?: string | null;
        };
        Update: {
          action?: Database['public']['Enums']['activity_action'];
          actor_id?: string | null;
          created_at?: string;
          group_id?: string | null;
          id?: string;
          list_id?: string | null;
          metadata?: NonNullable<Json>;
          subject?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'activity_log_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'activity_log_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'shopping_groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'activity_log_list_id_fkey';
            columns: ['list_id'];
            isOneToOne: false;
            referencedRelation: 'list_totals';
            referencedColumns: ['list_id'];
          },
          {
            foreignKeyName: 'activity_log_list_id_fkey';
            columns: ['list_id'];
            isOneToOne: false;
            referencedRelation: 'shopping_lists';
            referencedColumns: ['id'];
          },
        ];
      };
      categories: {
        Row: {
          archived_at: string | null;
          created_at: string;
          id: string;
          is_default: boolean;
          name: string;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          archived_at?: string | null;
          created_at?: string;
          id?: string;
          is_default?: boolean;
          name: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          archived_at?: string | null;
          created_at?: string;
          id?: string;
          is_default?: boolean;
          name?: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'categories_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      currencies: {
        Row: {
          code: string;
          decimal_digits: number;
          is_active: boolean;
          name: string;
          symbol: string;
        };
        Insert: {
          code: string;
          decimal_digits: number;
          is_active?: boolean;
          name: string;
          symbol: string;
        };
        Update: {
          code?: string;
          decimal_digits?: number;
          is_active?: boolean;
          name?: string;
          symbol?: string;
        };
        Relationships: [];
      };
      email_outbox: {
        Row: {
          attempts: number;
          created_at: string;
          id: string;
          kind: Database['public']['Enums']['email_kind'];
          last_error: string | null;
          locked_at: string | null;
          next_attempt_at: string;
          recipient_id: string | null;
          reference_id: string;
          sent_at: string | null;
          status: Database['public']['Enums']['email_status'];
          to_email: string;
        };
        Insert: {
          attempts?: number;
          created_at?: string;
          id?: string;
          kind: Database['public']['Enums']['email_kind'];
          last_error?: string | null;
          locked_at?: string | null;
          next_attempt_at?: string;
          recipient_id?: string | null;
          reference_id: string;
          sent_at?: string | null;
          status?: Database['public']['Enums']['email_status'];
          to_email: string;
        };
        Update: {
          attempts?: number;
          created_at?: string;
          id?: string;
          kind?: Database['public']['Enums']['email_kind'];
          last_error?: string | null;
          locked_at?: string | null;
          next_attempt_at?: string;
          recipient_id?: string | null;
          reference_id?: string;
          sent_at?: string | null;
          status?: Database['public']['Enums']['email_status'];
          to_email?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'email_outbox_recipient_id_fkey';
            columns: ['recipient_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      group_members: {
        Row: {
          created_at: string;
          group_id: string;
          id: string;
          invited_by: string | null;
          role: Database['public']['Enums']['member_role'];
          status: Database['public']['Enums']['member_status'];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          group_id: string;
          id?: string;
          invited_by?: string | null;
          role: Database['public']['Enums']['member_role'];
          status?: Database['public']['Enums']['member_status'];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          group_id?: string;
          id?: string;
          invited_by?: string | null;
          role?: Database['public']['Enums']['member_role'];
          status?: Database['public']['Enums']['member_status'];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'group_members_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'shopping_groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'group_members_invited_by_fkey';
            columns: ['invited_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'group_members_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      invitations: {
        Row: {
          accepted_at: string | null;
          created_at: string;
          expires_at: string;
          id: string;
          invitee_email: string | null;
          invitee_user_id: string | null;
          inviter_id: string;
          resource_id: string;
          resource_name: string | null;
          resource_type: Database['public']['Enums']['invitation_resource'];
          responded_at: string | null;
          role: Database['public']['Enums']['member_role'];
          status: Database['public']['Enums']['member_status'];
          is_invitee: boolean | null;
        };
        Insert: {
          accepted_at?: string | null;
          created_at?: string;
          expires_at?: string;
          id?: string;
          invitee_email?: string | null;
          invitee_user_id?: string | null;
          inviter_id: string;
          resource_id: string;
          resource_name?: string | null;
          resource_type: Database['public']['Enums']['invitation_resource'];
          responded_at?: string | null;
          role: Database['public']['Enums']['member_role'];
          status?: Database['public']['Enums']['member_status'];
        };
        Update: {
          accepted_at?: string | null;
          created_at?: string;
          expires_at?: string;
          id?: string;
          invitee_email?: string | null;
          invitee_user_id?: string | null;
          inviter_id?: string;
          resource_id?: string;
          resource_name?: string | null;
          resource_type?: Database['public']['Enums']['invitation_resource'];
          responded_at?: string | null;
          role?: Database['public']['Enums']['member_role'];
          status?: Database['public']['Enums']['member_status'];
        };
        Relationships: [
          {
            foreignKeyName: 'invitations_invitee_user_id_fkey';
            columns: ['invitee_user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invitations_inviter_id_fkey';
            columns: ['inviter_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      list_items: {
        Row: {
          budgeted_total: number | null;
          budgeted_unit_price: number;
          category_id: string | null;
          created_at: string;
          created_by: string;
          id: string;
          list_id: string;
          notes: string | null;
          product_id: string;
          purchased_at: string | null;
          quantity: number;
          status: Database['public']['Enums']['list_item_status'];
          unit: string | null;
          updated_at: string;
        };
        Insert: {
          budgeted_total?: never;
          budgeted_unit_price: number;
          category_id?: string | null;
          created_at?: string;
          created_by: string;
          id?: string;
          list_id: string;
          notes?: string | null;
          product_id: string;
          purchased_at?: string | null;
          quantity?: number;
          status?: Database['public']['Enums']['list_item_status'];
          unit?: string | null;
          updated_at?: string;
        };
        Update: {
          budgeted_total?: never;
          budgeted_unit_price?: number;
          category_id?: string | null;
          created_at?: string;
          created_by?: string;
          id?: string;
          list_id?: string;
          notes?: string | null;
          product_id?: string;
          purchased_at?: string | null;
          quantity?: number;
          status?: Database['public']['Enums']['list_item_status'];
          unit?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'list_items_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'list_items_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'list_items_list_id_fkey';
            columns: ['list_id'];
            isOneToOne: false;
            referencedRelation: 'list_totals';
            referencedColumns: ['list_id'];
          },
          {
            foreignKeyName: 'list_items_list_id_fkey';
            columns: ['list_id'];
            isOneToOne: false;
            referencedRelation: 'shopping_lists';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'list_items_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'products';
            referencedColumns: ['id'];
          },
        ];
      };
      list_members: {
        Row: {
          created_at: string;
          id: string;
          invited_by: string | null;
          list_id: string;
          role: Database['public']['Enums']['member_role'];
          status: Database['public']['Enums']['member_status'];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          invited_by?: string | null;
          list_id: string;
          role: Database['public']['Enums']['member_role'];
          status?: Database['public']['Enums']['member_status'];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          invited_by?: string | null;
          list_id?: string;
          role?: Database['public']['Enums']['member_role'];
          status?: Database['public']['Enums']['member_status'];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'list_members_invited_by_fkey';
            columns: ['invited_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'list_members_list_id_fkey';
            columns: ['list_id'];
            isOneToOne: false;
            referencedRelation: 'list_totals';
            referencedColumns: ['list_id'];
          },
          {
            foreignKeyName: 'list_members_list_id_fkey';
            columns: ['list_id'];
            isOneToOne: false;
            referencedRelation: 'shopping_lists';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'list_members_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      monthly_report_items: {
        Row: {
          budgeted_amount: number;
          category_id: string | null;
          category_name_snapshot: string;
          id: string;
          item_count: number;
          purchased_amount: number;
          report_id: string;
          variance: number;
        };
        Insert: {
          budgeted_amount: number;
          category_id?: string | null;
          category_name_snapshot: string;
          id?: string;
          item_count: number;
          purchased_amount: number;
          report_id: string;
          variance: number;
        };
        Update: {
          budgeted_amount?: number;
          category_id?: string | null;
          category_name_snapshot?: string;
          id?: string;
          item_count?: number;
          purchased_amount?: number;
          report_id?: string;
          variance?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'monthly_report_items_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'monthly_report_items_report_id_fkey';
            columns: ['report_id'];
            isOneToOne: false;
            referencedRelation: 'monthly_reports';
            referencedColumns: ['id'];
          },
        ];
      };
      monthly_reports: {
        Row: {
          created_at: string;
          currency_code: string;
          generated_at: string;
          group_id: string | null;
          id: string;
          list_id: string | null;
          month: number;
          owner_id: string;
          period_end: string | null;
          period_start: string | null;
          total_budget: number;
          total_purchased: number;
          total_variance: number;
          year: number;
        };
        Insert: {
          created_at?: string;
          currency_code: string;
          generated_at?: string;
          group_id?: string | null;
          id?: string;
          list_id?: string | null;
          month: number;
          owner_id: string;
          period_end?: string | null;
          period_start?: string | null;
          total_budget: number;
          total_purchased: number;
          total_variance: number;
          year: number;
        };
        Update: {
          created_at?: string;
          currency_code?: string;
          generated_at?: string;
          group_id?: string | null;
          id?: string;
          list_id?: string | null;
          month?: number;
          owner_id?: string;
          period_end?: string | null;
          period_start?: string | null;
          total_budget?: number;
          total_purchased?: number;
          total_variance?: number;
          year?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'monthly_reports_currency_code_fkey';
            columns: ['currency_code'];
            isOneToOne: false;
            referencedRelation: 'currencies';
            referencedColumns: ['code'];
          },
          {
            foreignKeyName: 'monthly_reports_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'shopping_groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'monthly_reports_list_id_fkey';
            columns: ['list_id'];
            isOneToOne: false;
            referencedRelation: 'list_totals';
            referencedColumns: ['list_id'];
          },
          {
            foreignKeyName: 'monthly_reports_list_id_fkey';
            columns: ['list_id'];
            isOneToOne: false;
            referencedRelation: 'shopping_lists';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'monthly_reports_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      notifications: {
        Row: {
          created_at: string;
          id: string;
          message: string;
          read_at: string | null;
          resource_id: string | null;
          resource_type: string | null;
          title: string;
          type: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          message: string;
          read_at?: string | null;
          resource_id?: string | null;
          resource_type?: string | null;
          title: string;
          type: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          message?: string;
          read_at?: string | null;
          resource_id?: string | null;
          resource_type?: string | null;
          title?: string;
          type?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'notifications_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      price_history: {
        Row: {
          created_at: string;
          currency_code: string;
          id: string;
          price: number;
          product_id: string;
          purchase_id: string;
          purchased_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          currency_code: string;
          id?: string;
          price: number;
          product_id: string;
          purchase_id: string;
          purchased_at: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          currency_code?: string;
          id?: string;
          price?: number;
          product_id?: string;
          purchase_id?: string;
          purchased_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'price_history_currency_code_fkey';
            columns: ['currency_code'];
            isOneToOne: false;
            referencedRelation: 'currencies';
            referencedColumns: ['code'];
          },
          {
            foreignKeyName: 'price_history_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'products';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'price_history_purchase_id_fkey';
            columns: ['purchase_id'];
            isOneToOne: true;
            referencedRelation: 'purchases';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'price_history_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      products: {
        Row: {
          archived_at: string | null;
          created_at: string;
          default_category_id: string | null;
          id: string;
          name: string;
          notes: string | null;
          owner_id: string;
          updated_at: string;
        };
        Insert: {
          archived_at?: string | null;
          created_at?: string;
          default_category_id?: string | null;
          id?: string;
          name: string;
          notes?: string | null;
          owner_id: string;
          updated_at?: string;
        };
        Update: {
          archived_at?: string | null;
          created_at?: string;
          default_category_id?: string | null;
          id?: string;
          name?: string;
          notes?: string | null;
          owner_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'products_default_category_id_fkey';
            columns: ['default_category_id'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'products_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          display_name: string;
          id: string;
          updated_at: string;
          username: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          display_name: string;
          id: string;
          updated_at?: string;
          username: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string;
          id?: string;
          updated_at?: string;
          username?: string;
        };
        Relationships: [];
      };
      purchases: {
        Row: {
          budgeted_amount: number;
          category_id: string | null;
          created_at: string;
          currency_code: string;
          group_id: string | null;
          id: string;
          list_id: string;
          list_item_id: string;
          product_id: string;
          purchased_amount: number;
          purchased_at: string;
          quantity: number;
          user_id: string;
        };
        Insert: {
          budgeted_amount: number;
          category_id?: string | null;
          created_at?: string;
          currency_code: string;
          group_id?: string | null;
          id?: string;
          list_id: string;
          list_item_id: string;
          product_id: string;
          purchased_amount: number;
          purchased_at?: string;
          quantity: number;
          user_id: string;
        };
        Update: {
          budgeted_amount?: number;
          category_id?: string | null;
          created_at?: string;
          currency_code?: string;
          group_id?: string | null;
          id?: string;
          list_id?: string;
          list_item_id?: string;
          product_id?: string;
          purchased_amount?: number;
          purchased_at?: string;
          quantity?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'purchases_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'purchases_currency_code_fkey';
            columns: ['currency_code'];
            isOneToOne: false;
            referencedRelation: 'currencies';
            referencedColumns: ['code'];
          },
          {
            foreignKeyName: 'purchases_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'shopping_groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'purchases_list_id_fkey';
            columns: ['list_id'];
            isOneToOne: false;
            referencedRelation: 'list_totals';
            referencedColumns: ['list_id'];
          },
          {
            foreignKeyName: 'purchases_list_id_fkey';
            columns: ['list_id'];
            isOneToOne: false;
            referencedRelation: 'shopping_lists';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'purchases_list_item_id_fkey';
            columns: ['list_item_id'];
            isOneToOne: true;
            referencedRelation: 'list_items';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'purchases_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'products';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'purchases_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      shopping_groups: {
        Row: {
          archived_at: string | null;
          created_at: string;
          currency_code: string;
          description: string | null;
          id: string;
          name: string;
          owner_id: string;
          updated_at: string;
        };
        Insert: {
          archived_at?: string | null;
          created_at?: string;
          currency_code: string;
          description?: string | null;
          id?: string;
          name: string;
          owner_id: string;
          updated_at?: string;
        };
        Update: {
          archived_at?: string | null;
          created_at?: string;
          currency_code?: string;
          description?: string | null;
          id?: string;
          name?: string;
          owner_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'shopping_groups_currency_code_fkey';
            columns: ['currency_code'];
            isOneToOne: false;
            referencedRelation: 'currencies';
            referencedColumns: ['code'];
          },
          {
            foreignKeyName: 'shopping_groups_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      shopping_lists: {
        Row: {
          archived_at: string | null;
          category_id: string | null;
          created_at: string;
          currency_code: string;
          description: string | null;
          group_id: string | null;
          id: string;
          name: string;
          owner_id: string;
          updated_at: string;
        };
        Insert: {
          archived_at?: string | null;
          category_id?: string | null;
          created_at?: string;
          currency_code: string;
          description?: string | null;
          group_id?: string | null;
          id?: string;
          name: string;
          owner_id: string;
          updated_at?: string;
        };
        Update: {
          archived_at?: string | null;
          category_id?: string | null;
          created_at?: string;
          currency_code?: string;
          description?: string | null;
          group_id?: string | null;
          id?: string;
          name?: string;
          owner_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'shopping_lists_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'shopping_lists_currency_code_fkey';
            columns: ['currency_code'];
            isOneToOne: false;
            referencedRelation: 'currencies';
            referencedColumns: ['code'];
          },
          {
            foreignKeyName: 'shopping_lists_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'shopping_groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'shopping_lists_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      user_settings: {
        Row: {
          created_at: string;
          default_currency: string;
          email_notifications: boolean;
          language: string | null;
          timezone: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          default_currency?: string;
          email_notifications?: boolean;
          language?: string | null;
          timezone?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          default_currency?: string;
          email_notifications?: boolean;
          language?: string | null;
          timezone?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_settings_default_currency_fkey';
            columns: ['default_currency'];
            isOneToOne: false;
            referencedRelation: 'currencies';
            referencedColumns: ['code'];
          },
          {
            foreignKeyName: 'user_settings_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      group_totals: {
        Row: {
          budgeted_total: number | null;
          currency_code: string | null;
          group_id: string | null;
          list_count: number | null;
          purchased_total: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'shopping_lists_currency_code_fkey';
            columns: ['currency_code'];
            isOneToOne: false;
            referencedRelation: 'currencies';
            referencedColumns: ['code'];
          },
          {
            foreignKeyName: 'shopping_lists_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'shopping_groups';
            referencedColumns: ['id'];
          },
        ];
      };
      list_totals: {
        Row: {
          archived_at: string | null;
          budgeted_total: number | null;
          currency_code: string | null;
          group_id: string | null;
          item_count: number | null;
          list_id: string | null;
          purchased_budgeted_total: number | null;
          purchased_count: number | null;
          purchased_total: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'shopping_lists_currency_code_fkey';
            columns: ['currency_code'];
            isOneToOne: false;
            referencedRelation: 'currencies';
            referencedColumns: ['code'];
          },
          {
            foreignKeyName: 'shopping_lists_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'shopping_groups';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Functions: {
      can_edit_list: { Args: { target_list_id: string }; Returns: boolean };
      can_manage_list: { Args: { target_list_id: string }; Returns: boolean };
      can_purchase_list: { Args: { target_list_id: string }; Returns: boolean };
      can_view_list: { Args: { target_list_id: string }; Returns: boolean };
      cancel_invitation: {
        Args: { target_invitation_id: string };
        Returns: {
          accepted_at: string | null;
          created_at: string;
          expires_at: string;
          id: string;
          invitee_email: string | null;
          invitee_user_id: string | null;
          inviter_id: string;
          resource_id: string;
          resource_name: string | null;
          resource_type: Database['public']['Enums']['invitation_resource'];
          responded_at: string | null;
          role: Database['public']['Enums']['member_role'];
          status: Database['public']['Enums']['member_status'];
        };
        SetofOptions: {
          from: '*';
          to: 'invitations';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      claim_email_batch: {
        Args: { batch_size?: number };
        Returns: {
          attempts: number;
          created_at: string;
          id: string;
          kind: Database['public']['Enums']['email_kind'];
          last_error: string | null;
          locked_at: string | null;
          next_attempt_at: string;
          recipient_id: string | null;
          reference_id: string;
          sent_at: string | null;
          status: Database['public']['Enums']['email_status'];
          to_email: string;
        }[];
        SetofOptions: {
          from: '*';
          to: 'email_outbox';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      complete_email: {
        Args: { email_id: string; error_message?: string; outcome: Database['public']['Enums']['email_status'] };
        Returns: undefined;
      };
      create_invitation: {
        Args: {
          invitee: string;
          target_resource_id: string;
          target_resource_type: Database['public']['Enums']['invitation_resource'];
          target_role: Database['public']['Enums']['member_role'];
        };
        Returns: {
          accepted_at: string | null;
          created_at: string;
          expires_at: string;
          id: string;
          invitee_email: string | null;
          invitee_user_id: string | null;
          inviter_id: string;
          resource_id: string;
          resource_name: string | null;
          resource_type: Database['public']['Enums']['invitation_resource'];
          responded_at: string | null;
          role: Database['public']['Enums']['member_role'];
          status: Database['public']['Enums']['member_status'];
        };
        SetofOptions: {
          from: '*';
          to: 'invitations';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      current_confirmed_email: { Args: Record<PropertyKey, never>; Returns: string };
      duplicate_list: {
        Args: { new_name?: string; source_list_id: string };
        Returns: {
          archived_at: string | null;
          category_id: string | null;
          created_at: string;
          currency_code: string;
          description: string | null;
          group_id: string | null;
          id: string;
          name: string;
          owner_id: string;
          updated_at: string;
        };
        SetofOptions: {
          from: '*';
          to: 'shopping_lists';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      generate_monthly_report: {
        Args: { target_group_id?: string; target_list_id?: string; target_month: number; target_year: number };
        Returns: {
          created_at: string;
          currency_code: string;
          generated_at: string;
          group_id: string | null;
          id: string;
          list_id: string | null;
          month: number;
          owner_id: string;
          period_end: string | null;
          period_start: string | null;
          total_budget: number;
          total_purchased: number;
          total_variance: number;
          year: number;
        }[];
        SetofOptions: {
          from: '*';
          to: 'monthly_reports';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      get_group_role: { Args: { target_group_id: string }; Returns: Database['public']['Enums']['member_role'] };
      get_list_role: { Args: { target_list_id: string }; Returns: Database['public']['Enums']['member_role'] };
      get_price_suggestion: {
        Args: { target_currency_code: string; target_product_id: string };
        Returns: {
          latest_currency_code: string;
          latest_purchased_at: string;
          latest_unit_price: number;
          suggested_purchased_at: string;
          suggested_unit_price: number;
        }[];
      };
      is_client_request: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_invitee: { Args: { invitation: Database['public']['Tables']['invitations']['Row'] }; Returns: boolean };
      is_username_available: { Args: { candidate: string }; Returns: boolean };
      log_activity: {
        Args: {
          action: Database['public']['Enums']['activity_action'];
          group_id: string;
          list_id: string;
          metadata?: Json;
          subject: string;
        };
        Returns: undefined;
      };
      notify_user: {
        Args: {
          notification_message: string;
          notification_title: string;
          notification_type: string;
          recipient: string;
          target_id: string;
          target_type: string;
        };
        Returns: undefined;
      };
      product_name: { Args: { product_id: string }; Returns: string };
      purchase_list_item: {
        Args: { actual_amount?: number; target_item_id: string; use_budgeted_amount?: boolean };
        Returns: {
          budgeted_amount: number;
          category_id: string | null;
          created_at: string;
          currency_code: string;
          group_id: string | null;
          id: string;
          list_id: string;
          list_item_id: string;
          product_id: string;
          purchased_amount: number;
          purchased_at: string;
          quantity: number;
          user_id: string;
        };
        SetofOptions: {
          from: '*';
          to: 'purchases';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      require_active_currency: { Args: { code: string }; Returns: undefined };
      respond_to_invitation: {
        Args: { accept: boolean; target_invitation_id: string };
        Returns: {
          accepted_at: string | null;
          created_at: string;
          expires_at: string;
          id: string;
          invitee_email: string | null;
          invitee_user_id: string | null;
          inviter_id: string;
          resource_id: string;
          resource_name: string | null;
          resource_type: Database['public']['Enums']['invitation_resource'];
          responded_at: string | null;
          role: Database['public']['Enums']['member_role'];
          status: Database['public']['Enums']['member_status'];
        };
        SetofOptions: {
          from: '*';
          to: 'invitations';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      search_products: {
        Args: { query: string; result_limit?: number };
        Returns: {
          archived_at: string | null;
          created_at: string;
          default_category_id: string | null;
          id: string;
          name: string;
          notes: string | null;
          owner_id: string;
          updated_at: string;
        }[];
        SetofOptions: {
          from: '*';
          to: 'products';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      shares_resource_with: { Args: { other_user: string }; Returns: boolean };
      username_of: { Args: { user_id: string }; Returns: string };
      wants_email: { Args: { user_id: string }; Returns: boolean };
    };
    Enums: {
      activity_action:
        | 'LIST_CREATED'
        | 'LIST_ARCHIVED'
        | 'ITEM_ADDED'
        | 'ITEM_EDITED'
        | 'ITEM_REMOVED'
        | 'ITEM_PURCHASED'
        | 'MEMBER_ADDED'
        | 'MEMBER_ROLE_CHANGED'
        | 'MEMBER_REMOVED';
      email_kind: 'invitation' | 'monthly_report';
      email_status: 'pending' | 'sending' | 'sent' | 'failed' | 'skipped';
      invitation_resource: 'group' | 'list';
      list_item_status: 'pending' | 'purchased' | 'archived';
      member_role: 'owner' | 'viewer' | 'editor' | 'partner';
      member_status: 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    keyof (DefaultSchema['Tables'] & DefaultSchema['Views']) | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      activity_action: [
        'LIST_CREATED',
        'LIST_ARCHIVED',
        'ITEM_ADDED',
        'ITEM_EDITED',
        'ITEM_REMOVED',
        'ITEM_PURCHASED',
        'MEMBER_ADDED',
        'MEMBER_ROLE_CHANGED',
        'MEMBER_REMOVED',
      ],
      email_kind: ['invitation', 'monthly_report'],
      email_status: ['pending', 'sending', 'sent', 'failed', 'skipped'],
      invitation_resource: ['group', 'list'],
      list_item_status: ['pending', 'purchased', 'archived'],
      member_role: ['owner', 'viewer', 'editor', 'partner'],
      member_status: ['pending', 'accepted', 'declined', 'expired', 'cancelled'],
    },
  },
} as const;
