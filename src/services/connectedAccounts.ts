import { pgPool } from "../lib/pg";
import { ConnectedAccount, SocialMediaProfile } from "./composio";

export class ConnectedAccountsService {
  private static instance: ConnectedAccountsService;

  private constructor() {}

  public static getInstance(): ConnectedAccountsService {
    if (!ConnectedAccountsService.instance) {
      ConnectedAccountsService.instance = new ConnectedAccountsService();
    }
    return ConnectedAccountsService.instance;
  }

  /**
   * Create a new connected account
   */
  async createConnectedAccount(
    userId: string,
    profile: SocialMediaProfile
  ): Promise<ConnectedAccount> {
    try {
      console.log(
        `[CONNECTED-ACCOUNTS-SERVICE] Creating account with profile:`,
        profile
      );

      const query = `
        INSERT INTO public.connected_accounts (
          user_id, provider, account_label, account_email, 
          external_user_id, public_url, scopes, meta, status,
          auth_config_id, connected_account_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `;

      const values = [
        userId,
        profile.provider as any, // Cast to enum type
        profile.account_label,
        profile.account_email,
        profile.external_user_id,
        profile.public_url,
        profile.meta.scope ? [profile.meta.scope] : [],
        profile.meta,
        "active",
        `mock_auth_${Date.now()}`, // Mock auth_config_id
        profile.external_user_id, // Use external_user_id as connected_account_id
      ];

      console.log(`[CONNECTED-ACCOUNTS-SERVICE] Query:`, query);
      console.log(`[CONNECTED-ACCOUNTS-SERVICE] Values:`, values);

      const result = await pgPool.query(query, values);
      console.log(`[CONNECTED-ACCOUNTS-SERVICE] Query result:`, result.rows[0]);

      return this.mapDbRowToConnectedAccount(result.rows[0]);
    } catch (error: any) {
      console.error(
        `[CONNECTED-ACCOUNTS-SERVICE] Error creating connected account:`,
        error
      );
      console.error(`[CONNECTED-ACCOUNTS-SERVICE] Error details:`, {
        message: error.message,
        code: error.code,
        detail: error.detail,
        hint: error.hint,
        where: error.where,
      });
      throw error;
    }
  }

  /**
   * Get all connected accounts for a user
   */
  async getUserConnectedAccounts(userId: string): Promise<ConnectedAccount[]> {
    try {
      const query = `
        SELECT * FROM public.connected_accounts 
        WHERE user_id = $1 AND status = 'active'
        ORDER BY created_at DESC
      `;

      const result = await pgPool.query(query, [userId]);
      return result.rows.map((row) => this.mapDbRowToConnectedAccount(row));
    } catch (error) {
      console.error(
        `[CONNECTED-ACCOUNTS-SERVICE] Error fetching user connected accounts:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get a specific connected account by ID
   */
  async getConnectedAccount(
    accountId: number
  ): Promise<ConnectedAccount | null> {
    try {
      const query = `
        SELECT * FROM public.connected_accounts 
        WHERE id = $1 AND status = 'active'
      `;

      const result = await pgPool.query(query, [accountId]);

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapDbRowToConnectedAccount(result.rows[0]);
    } catch (error) {
      console.error(
        `[CONNECTED-ACCOUNTS-SERVICE] Error fetching connected account:`,
        error
      );
      throw error;
    }
  }

  /**
   * Get connected account by user and provider
   */
  async getConnectedAccountByProvider(
    userId: string,
    provider: string
  ): Promise<ConnectedAccount | null> {
    try {
      const query = `
        SELECT * FROM public.connected_accounts 
        WHERE user_id = $1 AND provider = $2 AND status = 'active'
      `;

      const result = await pgPool.query(query, [userId, provider]);

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapDbRowToConnectedAccount(result.rows[0]);
    } catch (error) {
      console.error(
        `[CONNECTED-ACCOUNTS-SERVICE] Error fetching connected account by provider:`,
        error
      );
      throw error;
    }
  }

  /**
   * Update connected account information
   */
  async updateConnectedAccount(
    accountId: number,
    updates: Partial<ConnectedAccount>
  ): Promise<ConnectedAccount> {
    try {
      const allowedFields = [
        "account_label",
        "account_email",
        "external_user_id",
        "external_org_id",
        "scopes",
        "status",
        "is_primary",
        "last_validated_at",
        "last_sync_at",
        "meta",
        "public_url",
      ];

      const updateFields: string[] = [];
      const values: any[] = [];
      let valueIndex = 1;

      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key) && value !== undefined) {
          updateFields.push(`${key} = $${valueIndex}`);
          values.push(value);
          valueIndex++;
        }
      }

      if (updateFields.length === 0) {
        throw new Error("No valid fields to update");
      }

      updateFields.push("updated_at = now()");
      values.push(accountId);

      const query = `
        UPDATE public.connected_accounts 
        SET ${updateFields.join(", ")}
        WHERE id = $${valueIndex}
        RETURNING *
      `;

      const result = await pgPool.query(query, values);
      return this.mapDbRowToConnectedAccount(result.rows[0]);
    } catch (error) {
      console.error(
        `[CONNECTED-ACCOUNTS-SERVICE] Error updating connected account:`,
        error
      );
      throw error;
    }
  }

  /**
   * Disconnect/delete a connected account
   */
  async disconnectAccount(accountId: number): Promise<boolean> {
    try {
      const query = `
        UPDATE public.connected_accounts 
        SET status = 'disconnected', updated_at = now()
        WHERE id = $1
        RETURNING id
      `;

      const result = await pgPool.query(query, [accountId]);
      return result.rows.length > 0;
    } catch (error) {
      console.error(
        `[CONNECTED-ACCOUNTS-SERVICE] Error disconnecting account:`,
        error
      );
      throw error;
    }
  }

  /**
   * Update last validation time for an account
   */
  async updateLastValidated(accountId: number): Promise<void> {
    try {
      const query = `
        UPDATE public.connected_accounts 
        SET last_validated_at = now(), updated_at = now()
        WHERE id = $1
      `;

      await pgPool.query(query, [accountId]);
    } catch (error) {
      console.error(
        `[CONNECTED-ACCOUNTS-SERVICE] Error updating last validated:`,
        error
      );
      throw error;
    }
  }

  /**
   * Update last sync time for an account
   */
  async updateLastSync(accountId: number): Promise<void> {
    try {
      const query = `
        UPDATE public.connected_accounts 
        SET last_sync_at = now(), updated_at = now()
        WHERE id = $1
      `;

      await pgPool.query(query, [accountId]);
    } catch (error) {
      console.error(
        `[CONNECTED-ACCOUNTS-SERVICE] Error updating last sync:`,
        error
      );
      throw error;
    }
  }

  /**
   * Check if user has a specific provider connected
   */
  async isProviderConnected(
    userId: string,
    provider: string
  ): Promise<boolean> {
    try {
      const account = await this.getConnectedAccountByProvider(
        userId,
        provider
      );
      return account !== null;
    } catch (error) {
      console.error(
        `[CONNECTED-ACCOUNTS-SERVICE] Error checking provider connection:`,
        error
      );
      return false;
    }
  }

  /**
   * Get connection statistics for a user
   */
  async getConnectionStats(userId: string): Promise<Record<string, any>> {
    try {
      const query = `
        SELECT 
          provider,
          COUNT(*) as count,
          MAX(created_at) as last_connected,
          MAX(last_sync_at) as last_synced
        FROM public.connected_accounts 
        WHERE user_id = $1 AND status = 'active'
        GROUP BY provider
      `;

      const result = await pgPool.query(query, [userId]);

      const stats: Record<string, any> = {};
      result.rows.forEach((row) => {
        stats[row.provider] = {
          count: parseInt(row.count),
          last_connected: row.last_connected,
          last_synced: row.last_synced,
        };
      });

      return stats;
    } catch (error) {
      console.error(
        `[CONNECTED-ACCOUNTS-SERVICE] Error fetching connection stats:`,
        error
      );
      throw error;
    }
  }

  /**
   * Map database row to ConnectedAccount interface
   */
  private mapDbRowToConnectedAccount(row: any): ConnectedAccount {
    return {
      id: parseInt(row.id),
      user_id: row.user_id,
      provider: row.provider,
      auth_config_id: row.auth_config_id,
      connected_account_id: row.connected_account_id,
      account_label: row.account_label,
      account_email: row.account_email,
      external_user_id: row.external_user_id,
      external_org_id: row.external_org_id,
      scopes: row.scopes || [],
      status: row.status,
      is_primary: row.is_primary,
      last_validated_at: row.last_validated_at
        ? new Date(row.last_validated_at)
        : undefined,
      last_sync_at: row.last_sync_at ? new Date(row.last_sync_at) : undefined,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
      meta: row.meta || {},
      public_url: row.public_url,
    };
  }

  /**
   * Clean up incorrect database entries that have wrong provider data
   */
  async cleanupIncorrectEntries(userId: string): Promise<void> {
    try {
      console.log(
        `[CONNECTED-ACCOUNTS-SERVICE] Cleaning up incorrect entries for user ${userId}`
      );

      // Find entries where the meta data contains LinkedIn information but the provider is not LinkedIn
      const query = `
        DELETE FROM public.connected_accounts 
        WHERE user_id = $1 
        AND provider IN ('facebook', 'instagram') 
        AND meta::text LIKE '%linkedin%'
      `;

      const result = await pgPool.query(query, [userId]);
      const rowCount = result.rowCount || 0;
      console.log(
        `[CONNECTED-ACCOUNTS-SERVICE] Cleaned up ${rowCount} incorrect entries`
      );

      if (rowCount > 0) {
        console.log(
          `[CONNECTED-ACCOUNTS-SERVICE] Removed entries with wrong provider data`
        );
      }
    } catch (error) {
      console.error(
        `[CONNECTED-ACCOUNTS-SERVICE] Error cleaning up incorrect entries:`,
        error
      );
      // Don't throw error for cleanup operations
    }
  }
}

// Export singleton instance
export const connectedAccountsService = ConnectedAccountsService.getInstance();
