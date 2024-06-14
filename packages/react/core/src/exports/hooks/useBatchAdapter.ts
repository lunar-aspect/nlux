import {BatchSubmit, ChatAdapter} from '@shared/types/adapters/chat/chatAdapter';
import {DependencyList, useMemo} from 'react';

/**
 * A simple hook to convert a callback function to a ChatAdapter to use to fetch data as a stream.
 *
 * @param submit
 * @param dependencies
 */
export const useBatchAdapter = function <AiMsg = string>(
    submit: BatchSubmit<AiMsg>,
    dependencies?: DependencyList,
): ChatAdapter<AiMsg> {

    return useMemo(
        () => ({batchText: submit}),
        dependencies ?? [{}], // If no dependencies are provided, we use an empty object to force the hook
        // to run every time (no memoization).
    );
};