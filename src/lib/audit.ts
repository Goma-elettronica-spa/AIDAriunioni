import { supabase } from "@/integrations/supabase/client";

interface AuditEntry {
  tenantId: string;
  userId: string;
  action: "create" | "update" | "delete";
  entityType: string;
  entityId: string;
  oldValues?: Record<string, any> | null;
  newValues?: Record<string, any> | null;
  modifiedForUserId?: string | null;
}

export async function writeAuditLog(entry: AuditEntry) {
  try {
    const payload = {
      tenant_id: entry.tenantId,
      user_id: entry.userId,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId,
      old_values: entry.oldValues ?? null,
      new_values: entry.newValues ?? null,
      modified_for_user_id: entry.modifiedForUserId ?? null,
    };
    const { error } = await supabase.from("audit_logs").insert(payload);
    if (error) {
      console.error("Audit log insert failed:", error, entry);
      // Fallback: try via RPC if direct insert fails (e.g. missing INSERT RLS policy)
      const { error: rpcError } = await (supabase.rpc as any)("write_audit_log", {
        p_tenant_id: payload.tenant_id,
        p_user_id: payload.user_id,
        p_action: payload.action,
        p_entity_type: payload.entity_type,
        p_entity_id: payload.entity_id,
        p_old_values: payload.old_values,
        p_new_values: payload.new_values,
        p_modified_for_user_id: payload.modified_for_user_id,
      });
      if (rpcError) {
        console.error("Audit log RPC fallback also failed:", rpcError, entry);
      }
    }
  } catch (e) {
    console.error("Audit log insert failed:", e, entry);
    // Don't throw - audit logging should never break the main flow
  }
}
