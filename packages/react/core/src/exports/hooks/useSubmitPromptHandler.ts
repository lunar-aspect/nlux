import {ComposerOptions, EventsMap} from '@nlux/core';
import {MutableRefObject, useCallback, useEffect, useMemo, useRef} from 'react';
import {submitPrompt} from '../../../../../shared/src/services/submitPrompt/submitPromptImpl';
import {ChatAdapter} from '../../../../../shared/src/types/adapters/chat/chatAdapter';
import {ChatAdapterExtras} from '../../../../../shared/src/types/adapters/chat/chatAdapterExtras';
import {StandardChatAdapter} from '../../../../../shared/src/types/adapters/chat/standardChatAdapter';
import {ChatSegment} from '../../../../../shared/src/types/chatSegment/chatSegment';
import {ChatSegmentAiMessage} from '../../../../../shared/src/types/chatSegment/chatSegmentAiMessage';
import {ChatSegmentUserMessage} from '../../../../../shared/src/types/chatSegment/chatSegmentUserMessage';
import {NLErrors} from '../../../../../shared/src/types/exceptions/errors';
import {ComposerStatus} from '../../../../../shared/src/components/Composer/props';
import {warn} from '../../../../../shared/src/utils/warn';
import {ImperativeConversationCompProps} from '../../logic/Conversation/props';
import {AiChatProps} from '../props';
import {useAdapterExtras} from './useAdapterExtras';

type SubmitPromptHandlerProps<AiMsg> = {
    aiChatProps: AiChatProps<AiMsg>;
    adapterToUse?: ChatAdapter<AiMsg> | StandardChatAdapter<AiMsg>;
    prompt: string;
    composerOptions?: ComposerOptions;
    chatSegments: ChatSegment<AiMsg>[];
    initialSegment?: ChatSegment<AiMsg>;
    showException: (message: string) => void;
    setChatSegments: (segments: ChatSegment<AiMsg>[]) => void;
    setComposerStatus: (status: ComposerStatus) => void;
    setPrompt: (prompt: string) => void;
    conversationRef: MutableRefObject<ImperativeConversationCompProps<AiMsg> | null>
};

export const useSubmitPromptHandler = <AiMsg>(props: SubmitPromptHandlerProps<AiMsg>) => {
    const {
        aiChatProps,
        adapterToUse,
        prompt: promptTyped,
        composerOptions,
        showException,
        chatSegments,
        initialSegment,
        setChatSegments,
        setComposerStatus,
        setPrompt,
        conversationRef,
    } = props;

    const hasValidInput = useMemo(() => promptTyped.length > 0, [promptTyped]);

    // The prompt typed will be read by the submitPrompt function, but it will not be used as a
    // dependency for the submitPrompt function (only the promptToSubmit is a dependency to useCallback).
    // Hence, the use of useRef to store the value and access it within the submitPrompt function, without
    // causing the memoized function to be re-created.
    const promptTypedRef = useRef(promptTyped);
    promptTypedRef.current = promptTyped;

    // React functions and state that can be accessed by non-React DOM update code
    const domToReactRef = useRef({
        chatSegments,
        setChatSegments,
        setComposerStatus,
        showException,
        setPrompt,
    });

    // Callback events can be used by the non-React DOM update code
    const callbackEvents = useRef<EventsMap<AiMsg>>({});

    useEffect(() => {
        domToReactRef.current = {
            chatSegments,
            setChatSegments,
            setComposerStatus,
            showException,
            setPrompt,
        };
    }, [chatSegments, setChatSegments, setComposerStatus, showException, setPrompt]);

    const adapterExtras: ChatAdapterExtras<AiMsg> = useAdapterExtras(
        aiChatProps,
        initialSegment ? [initialSegment, ...chatSegments] : chatSegments,
        aiChatProps.conversationOptions?.historyPayloadSize,
    );

    useEffect(() => {
        callbackEvents.current = aiChatProps.events || {};
    }, [aiChatProps.events]);

    return useCallback(
        () => {
            if (!adapterToUse) {
                warn('No valid adapter was provided to AiChat component');
                return;
            }

            if (!hasValidInput) {
                return;
            }

            if (composerOptions?.disableSubmitButton) {
                return;
            }

            setComposerStatus('submitting');
            const promptToSubmit = promptTyped;
            const streamedMessageIds: Set<string> = new Set();

            const {
                segment: chatSegment,
                observable: chatSegmentObservable,
            } = submitPrompt<AiMsg>(
                promptToSubmit,
                adapterToUse,
                adapterExtras,
            );

            if (chatSegment.status === 'error') {
                warn('Error occurred while submitting prompt');
                showException('Error occurred while submitting prompt');
                setComposerStatus('typing');

                // Reset the prompt if the composer is empty
                if (promptTypedRef.current === '') {
                    setPrompt(promptToSubmit);
                }
                return;
            }

            // THE FOLLOWING CODE IS USED TO TRIGGER AN UPDATE OF THE REACT STATE.
            // The 'on' event listeners are implemented by @nlux/core non-React prompt handler.
            // On 'complete' and 'update' events, the chat segment is updated, but in order
            // to trigger a check and potentially re-render the React component, we need to change
            // the reference of the parts array by creating a new array.

            const handleSegmentItemReceived = (item: ChatSegmentAiMessage<AiMsg> | ChatSegmentUserMessage) => {
                const currentChatSegments = domToReactRef.current.chatSegments;
                const newChatSegments: ChatSegment<AiMsg>[] = currentChatSegments.map(
                    (currentChatSegment) => {
                        if (currentChatSegment.uid !== chatSegmentObservable.segmentId) {
                            return currentChatSegment;
                        }

                        return {
                            ...currentChatSegment,
                            items: [
                                ...currentChatSegment.items,
                                {...item},
                            ],
                        };
                    },
                );

                domToReactRef.current.setChatSegments(newChatSegments);
            };

            chatSegmentObservable.on('userMessageReceived', (userMessage) => {
                handleSegmentItemReceived(userMessage);
                if (callbackEvents.current?.messageSent) {
                    callbackEvents.current.messageSent({
                        uid: userMessage.uid,
                        message: userMessage.content,
                    });
                }
            });

            chatSegmentObservable.on('aiMessageStreamStarted', (aiStreamedMessage) => {
                handleSegmentItemReceived(aiStreamedMessage);
                domToReactRef.current.setComposerStatus('waiting');
                if (promptTypedRef.current === promptToSubmit) {
                    domToReactRef.current.setPrompt('');
                }

                streamedMessageIds.add(aiStreamedMessage.uid);
                if (callbackEvents.current?.messageStreamStarted) {
                    callbackEvents.current.messageStreamStarted({uid: aiStreamedMessage.uid});
                }
            });

            chatSegmentObservable.on('aiMessageReceived', (aiMessage) => {
                const currentChatSegments = domToReactRef.current.chatSegments;
                const newChatSegments: ChatSegment<AiMsg>[] = currentChatSegments.map(
                    (currentChatSegment) => {
                        if (currentChatSegment.uid !== chatSegmentObservable.segmentId) {
                            return currentChatSegment;
                        }

                        return {...currentChatSegment, items: [...currentChatSegment.items, {...aiMessage}]};
                    },
                );

                domToReactRef.current.setChatSegments(newChatSegments);
                if (callbackEvents.current?.messageReceived) {
                    callbackEvents.current.messageReceived({
                        uid: aiMessage.uid,
                        message: aiMessage.content,
                    });
                }
            });

            chatSegmentObservable.on('complete', (completeChatSegment) => {
                domToReactRef.current.setComposerStatus('typing');
                const currentChatSegments = domToReactRef.current.chatSegments;
                const newChatSegments: ChatSegment<AiMsg>[] = currentChatSegments.map(
                    (currentChatSegment) => {
                        if (currentChatSegment.uid !== chatSegmentObservable.segmentId) {
                            return currentChatSegment;
                        }

                        return {...completeChatSegment};
                    },
                );

                domToReactRef.current.setChatSegments(newChatSegments);
                if (promptTypedRef.current === promptToSubmit) {
                    setPrompt('');
                }

                if (streamedMessageIds.size > 0) {
                    streamedMessageIds.forEach((messageId) => {
                        conversationRef.current?.completeStream(chatSegmentObservable.segmentId, messageId);
                    });

                    streamedMessageIds.clear();
                }
            });

            chatSegmentObservable.on('aiChunkReceived', (
                {
                    messageId,
                    chunk,
                    serverResponse,
                }) => {
                requestAnimationFrame(() => {
                    // We need to wait a bit before streaming the chunk to the chat item
                    // because of the React lifecycle. The chat item might not be rendered yet.
                    conversationRef.current?.streamChunk(chatSegment.uid, messageId, chunk);
                });
            });

            chatSegmentObservable.on('aiMessageStreamed', (streamedMessage) => {
                if (callbackEvents.current?.messageReceived) {
                    callbackEvents.current?.messageReceived({
                        uid: streamedMessage.uid,
                        // In streamed messages, the AiMsg is always a string
                        message: streamedMessage.content as AiMsg,
                    });
                }
            });

            chatSegmentObservable.on('error', (errorId, errorObject) => {
                const parts = domToReactRef.current.chatSegments;
                const newParts = parts.filter((part) => part.uid !== chatSegment.uid);
                const errorMessage = NLErrors[errorId];

                domToReactRef.current.setChatSegments(newParts);
                domToReactRef.current.setComposerStatus('typing');
                domToReactRef.current.showException(errorMessage);

                if (promptTypedRef.current === '') {
                    setPrompt(promptToSubmit);
                }

                if (callbackEvents.current?.error) {
                    callbackEvents.current.error({
                        errorId,
                        message: errorMessage,
                        errorObject,
                    });
                }
            });

            domToReactRef.current.setChatSegments([
                ...domToReactRef.current.chatSegments,
                chatSegment,
            ]);
        },
        [
            promptTyped,
            adapterToUse,
            adapterExtras,
            showException,
            domToReactRef,
            composerOptions?.disableSubmitButton,
        ],
    );
};
