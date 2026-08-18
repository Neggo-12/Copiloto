import { useCallback, useMemo, useState } from "react";
import * as statusActions from "@/lib/actions/status";
import type { PublishStatusInput, StatusesState } from "@/lib/actions/status";
import { MOCK_STATUSES } from "@/lib/domain/mock-data";
import type { StatusId, StatusUpdate, UserId } from "@/lib/domain/types";

const INITIAL_STATE: StatusesState = { statuses: MOCK_STATUSES };

/**
 * Controlador de Estados/Historias: vincula las acciones aisladas de
 * `status.ts` al estado local simulado de esta fase.
 */
export function useStatuses() {
  const [state, setState] = useState<StatusesState>(INITIAL_STATE);

  const feed = useMemo(() => statusActions.getStatusFeed(state), [state]);
  const myStatuses = useMemo(() => statusActions.getMyStatuses(state), [state]);

  const publishStatus = useCallback((input: PublishStatusInput): StatusUpdate | null => {
    let published: StatusUpdate | null = null;
    setState((prev) => {
      const result = statusActions.publishStatus(prev, input);
      published = result.status;
      return result.state;
    });
    return published;
  }, []);

  const markStatusViewed = useCallback((statusId: StatusId) => {
    setState((prev) => statusActions.markStatusViewed(prev, statusId));
  }, []);

  const deleteStatus = useCallback((statusId: StatusId) => {
    setState((prev) => statusActions.deleteStatus(prev, statusId));
  }, []);

  const getStatusesByAuthor = useCallback(
    (authorId: UserId) => statusActions.getStatusesByAuthor(state, authorId),
    [state],
  );

  const getStatusViewers = useCallback(
    (statusId: StatusId) => statusActions.getStatusViewers(state, statusId),
    [state],
  );

  return {
    state,
    feed,
    myStatuses,
    publishStatus,
    markStatusViewed,
    deleteStatus,
    getStatusesByAuthor,
    getStatusViewers,
  };
}

export type StatusesController = ReturnType<typeof useStatuses>;
