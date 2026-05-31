// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

// TeacherApprovalDashboard — wrapper page for the peer-project review queue.
// Previously a stub; now delegates to PeerProjectReview.

import React from 'react';
import { PeerProjectReview } from './FieldNoteReview';

export const TeacherApprovalDashboard: React.FC = () => (
  <PeerProjectReview classId={undefined} />
);

export default TeacherApprovalDashboard;
