export const bookingRequestDurationMs = 3 * 24 * 60 * 60 * 1000;

export const bookingRequestStatuses = Object.freeze({
  negotiating: "negotiating",
  agreed: "agreed",
  expired: "expired",
  ended: "ended",
});

export function getProposalStart(proposal) {
  return new Date(`${proposal?.date || ""}T${proposal?.start || ""}`);
}

export function calculateRequestExpiry(from, proposal) {
  const extendedUntil = new Date(new Date(from).getTime() + bookingRequestDurationMs);
  const lessonStart = getProposalStart(proposal);
  return new Date(Math.min(extendedUntil.getTime(), lessonStart.getTime())).toISOString();
}

export function getBookingRequestStatus(request, now = new Date()) {
  if (request.status !== bookingRequestStatuses.negotiating) return request.status;
  return new Date(request.expiresAt) <= now ? bookingRequestStatuses.expired : request.status;
}

export function requestNeedsActionFrom(request, role, now = new Date()) {
  return getBookingRequestStatus(request, now) === bookingRequestStatuses.negotiating
    && request.waitingFor === role;
}

export function getPendingBookingRequests(requests, role, coachId, now = new Date()) {
  return requests.filter((request) => request.coachId === coachId && requestNeedsActionFrom(request, role, now));
}

export function expireBookingRequest(request, now = new Date()) {
  if (getBookingRequestStatus(request, now) !== bookingRequestStatuses.expired || request.status === bookingRequestStatuses.expired) return request;
  return {
    ...request,
    status: bookingRequestStatuses.expired,
    waitingFor: null,
    expiredAt: now.toISOString(),
    events: [...(request.events || []), { type: "request-expired", at: now.toISOString(), demo: true }],
  };
}

export function extendBookingRequest(request, actorRole, now = new Date()) {
  if (getBookingRequestStatus(request, now) !== bookingRequestStatuses.negotiating) return request;
  return {
    ...request,
    expiresAt: calculateRequestExpiry(now, request.proposal),
    events: [...(request.events || []), {
      type: "request-extended",
      actorRole,
      at: now.toISOString(),
      demo: true,
    }],
  };
}

export function addBookingRequestMessage(request, actorRole, actorName, message, now = new Date()) {
  if (getBookingRequestStatus(request, now) !== bookingRequestStatuses.negotiating) return request;
  const normalizedMessage = String(message || "").trim();
  if (!normalizedMessage) return request;
  return {
    ...request,
    waitingFor: actorRole === "coach" ? "student" : "coach",
    events: [...(request.events || []), {
      type: "message",
      actorRole,
      actorName,
      message: normalizedMessage,
      at: now.toISOString(),
    }],
  };
}

export function proposeBookingRequestVersion(request, proposal, actorRole, now = new Date()) {
  const otherRole = actorRole === "coach" ? "student" : "coach";
  return {
    ...request,
    status: bookingRequestStatuses.negotiating,
    proposal: { ...proposal, version: Number(request.proposal?.version || 0) + 1 },
    proposerRole: actorRole,
    acceptedBy: [actorRole],
    waitingFor: otherRole,
    expiresAt: calculateRequestExpiry(now, proposal),
    events: [...(request.events || []), {
      type: "proposal-created",
      actorRole,
      proposalVersion: Number(request.proposal?.version || 0) + 1,
      at: now.toISOString(),
      demo: true,
    }],
  };
}

export function acceptBookingRequest(request, actorRole, now = new Date()) {
  if (!requestNeedsActionFrom(request, actorRole, now)) return request;
  return {
    ...request,
    status: bookingRequestStatuses.agreed,
    waitingFor: null,
    acceptedBy: [...new Set([...(request.acceptedBy || []), actorRole])],
    agreedAt: now.toISOString(),
    events: [...(request.events || []), {
      type: "proposal-accepted",
      actorRole,
      proposalVersion: request.proposal.version,
      at: now.toISOString(),
      demo: true,
    }],
  };
}

export function endBookingRequest(request, actorRole, actorName, now = new Date()) {
  if (getBookingRequestStatus(request, now) !== bookingRequestStatuses.negotiating) return request;
  return {
    ...request,
    status: bookingRequestStatuses.ended,
    waitingFor: null,
    endedBy: { role: actorRole, name: actorName },
    endedAt: now.toISOString(),
    events: [...(request.events || []), {
      type: "request-ended",
      actorRole,
      actorName,
      at: now.toISOString(),
      demo: true,
    }],
  };
}
