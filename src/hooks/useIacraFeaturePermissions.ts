import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export type IacraFeaturePermissions = {
  digital_enrollment: { view: boolean; create: boolean; approve: boolean };
  rooms: { view: boolean; assign: boolean; unassign: boolean };
  enrollment_tracking: { view: boolean; mark_sent: boolean };
};
const EMPTY: IacraFeaturePermissions = {
  digital_enrollment: { view: false, create: false, approve: false },
  rooms: { view: false, assign: false, unassign: false },
  enrollment_tracking: { view: false, mark_sent: false },
};
const FULL: IacraFeaturePermissions = {
  digital_enrollment: { view: true, create: true, approve: true },
  rooms: { view: true, assign: true, unassign: true },
  enrollment_tracking: { view: true, mark_sent: true },
};

/** UI only. Authorization is repeated inside each PostgreSQL RPC.
 * Failure to load denies access; never infer a grant from a menu click.
 */
export function useIacraFeaturePermissions(profile?: {
  id?: string; role?: string; access_status?: string;
} | null): IacraFeaturePermissions {
  const active = profile?.access_status === 'active';
  const isSuperAdmin = active && profile?.role === 'super_admin';
  const [state, setState] = useState<{
    id: string; permissions: IacraFeaturePermissions;
  } | null>(null);

  useEffect(() => {
    if (!active || !profile?.id || profile.role !== 'admin') {
      setState(null);
      return;
    }
    const id = profile.id;
    let cancelled = false;
    setState(null);
    void (async () => {
      const { data, error } = await supabase.rpc('eavra_current_feature_access');
      if (cancelled) return;
      if (error || !data || typeof data !== 'object') {
        setState({ id, permissions: EMPTY });
        return;
      }
      const result = data as Record<string, unknown>;
      const digital = (result.digital_enrollment || {}) as Record<string, unknown>;
      const rooms = (result.rooms || {}) as Record<string, unknown>;
      const tracking = (result.enrollment_tracking || {}) as Record<string, unknown>;
      setState({ id, permissions: {
        digital_enrollment: {
          view: digital.view === true,
          create: digital.view === true && digital.create === true,
          approve: digital.view === true && digital.approve === true,
        },
        rooms: {
          view: rooms.view === true,
          assign: rooms.view === true && rooms.assign === true,
          unassign: rooms.view === true && rooms.unassign === true,
        },
        enrollment_tracking: {
          view: tracking.view === true,
          mark_sent: tracking.view === true && tracking.mark_sent === true,
        },
      } });
    })();
    return () => { cancelled = true; };
  }, [active, profile?.id, profile?.role]);

  if (isSuperAdmin) return FULL;
  if (!active || profile?.role !== 'admin') return EMPTY;
  return state?.id === profile?.id ? state.permissions : EMPTY;
}
