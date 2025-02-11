import {ChatAdapterExtras, StreamingAdapterObserver} from '@nlux/core';
import {NluxUsageError} from '@shared/types/error';
import {ChatAdapterOptions} from '../types/adapterOptions';
import {LangServeAbstractAdapter} from './adapter';

export class LangServeBatchAdapter<AiMsg = string> extends LangServeAbstractAdapter<AiMsg> {
    constructor(options: ChatAdapterOptions<AiMsg>) {
        super(options);
    }

    async batchText(message: string, extras: ChatAdapterExtras<AiMsg>): Promise<string | object | undefined> {
        const body = this.getRequestBody(
            message,
            this.config,
            extras.conversationHistory,
        );

        const response = await fetch(this.endpointUrl, {
            method: 'POST',
            headers: {
                ...this.headers,
                'Content-Type': 'application/json',
            },
            body,
        });

        if (!response.ok) {
            throw new Error(`LangServe runnable returned status code: ${response.status}`);
        }

        const result = await response.json();
        if (typeof result !== 'object' || !result || result.output === undefined) {
            throw new Error(
                'Invalid response from LangServe runnable: Response is not an object ' +
                'or does not contain an "output" property',
            );
        }

        return (typeof result === 'object' && result) ? result.output : undefined;
    }

    streamText(message: string, observer: StreamingAdapterObserver, extras: ChatAdapterExtras<AiMsg>): void {
        throw new NluxUsageError({
            source: this.constructor.name,
            message: 'Cannot stream text from the batch adapter!',
        });
    }
}
