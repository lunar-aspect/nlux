import {ChatAdapterBuilder, ChatAdapterOptions, createUnsafeChatAdapter} from '@nlux/openai';
import {NluxUsageError} from '@shared/types/error';

const source = 'hooks/getAdapterBuilder';

export const getAdapterBuilder = <AiMsg>(options: ChatAdapterOptions): ChatAdapterBuilder<AiMsg> => {
    const {
        apiKey,
        dataTransferMode,
        systemMessage,
        model,
    } = options || {};

    if (dataTransferMode && dataTransferMode !== 'stream' && dataTransferMode !== 'batch') {
        throw new NluxUsageError({
            source,
            message: 'Data transfer mode not supported',
        });
    }

    if (!apiKey) {
        throw new NluxUsageError({
            source,
            message: 'API key is required',
        });
    }

    let newAdapter = createUnsafeChatAdapter<AiMsg>().withApiKey(apiKey);

    if (model !== undefined) {
        newAdapter = newAdapter.withModel(model);
    }

    if (dataTransferMode) {
        newAdapter = newAdapter.withDataTransferMode(dataTransferMode);
    }

    if (systemMessage) {
        newAdapter = newAdapter.withSystemMessage(systemMessage);
    }

    return newAdapter;
};
