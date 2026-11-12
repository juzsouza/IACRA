import React from 'react';
import {EnrollmentInvitationTracking} from '../components/EnrollmentInvitationTracking';

/** Separate navigation destination; only displayed after the same restricted
 * Matrícula Digital permission check as the existing invitation administration.
 */
export function EnrollmentTrackingPage({canMarkSent}:{canMarkSent:boolean}):React.ReactElement{
 return <main className="max-w-6xl mx-auto px-4 sm:px-6 py-5 space-y-3">
  <EnrollmentInvitationTracking canMarkSent={canMarkSent} revision={0}/>
 </main>;
}
