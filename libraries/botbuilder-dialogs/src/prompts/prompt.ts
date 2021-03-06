/**
 * @module botbuilder-dialogs
 */
/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { TurnContext, Activity, ActivityTypes, InputHints, MessageFactory } from 'botbuilder-core';
import { Choice, ChoiceFactory, ChoiceFactoryOptions } from '../choices';
import { DialogContext } from '../dialogContext';
import { Dialog, DialogTurnResult, DialogInstance, DialogReason } from '../dialog';


/**
 * Controls the way that choices for a `ChoicePrompt` or yes/no options for a `ConfirmPrompt` are
 * presented to a user.
 */
export enum ListStyle {
    /** Don't include any choices for prompt. */
    none,

    /** Automatically select the appropriate style for the current channel. */
    auto,

    /** Add choices to prompt as an inline list. */
    inline,

    /** Add choices to prompt as a numbered list. */
    list,

    /** Add choices to prompt as suggested actions. */
    suggestedAction
}

/** 
 * Basic configuration options supported by all prompts. 
 */
export interface PromptOptions {
    /** 
     * (Optional) Initial prompt to send the user. 
     */
    prompt?: string|Partial<Activity>;

    /** 
     * (Optional) Retry prompt to send the user. 
     */
    retryPrompt?: string|Partial<Activity>;

    /** 
     * (Optional) List of choices associated with the prompt. 
     */
    choices?: (string|Choice)[];

    /** 
     * (Optional) Additional validation rules to pass the prompts validator routine. 
     s*/
    validations?: object;
}

export interface PromptRecognizerResult<T> {
    succeeded: boolean;
    value?: T;
}

export type PromptValidator<T> = (context: TurnContext, prompt: PromptValidatorContext<T>) => Promise<void>;

export interface PromptValidatorContext<T> {
    recognized: PromptRecognizerResult<T>;
    state: object;
    options: PromptOptions;
    end(result: any): void;
}


/**
 * Base class for all prompts.
 */
export abstract class Prompt<T> extends Dialog {
    constructor(dialogId: string, private validator?: PromptValidator<T>) { 
        super(dialogId);
    }

    protected abstract onPrompt(context: TurnContext, state: object, options: PromptOptions, isRetry: boolean): Promise<void>;

    protected abstract onRecognize(context: TurnContext, state: object, options: PromptOptions): Promise<PromptRecognizerResult<T>>;

    public async dialogBegin(dc: DialogContext, options: PromptOptions): Promise<DialogTurnResult> {
        // Ensure prompts have input hint set
        const opt = Object.assign({}, options);
        if (opt.prompt && typeof opt.prompt === 'object' && typeof opt.prompt.inputHint !== 'string') {
            opt.prompt.inputHint = InputHints.ExpectingInput;
        }
        if (opt.retryPrompt && typeof opt.retryPrompt === 'object' && typeof opt.retryPrompt.inputHint !== 'string') {
            opt.retryPrompt.inputHint = InputHints.ExpectingInput;
        }

        // Initialize prompt state
        const state = dc.activeDialog.state as PromptState;
        state.options = opt;
        state.state = {};

        // Send initial prompt
        await this.onPrompt(dc.context, state.state, state.options, false);
        return Dialog.EndOfTurn;
    }

    public async dialogContinue(dc: DialogContext): Promise<DialogTurnResult> {
        // Don't do anything for non-message activities
        if (dc.context.activity.type !== ActivityTypes.Message) {
            return Dialog.EndOfTurn;
        }

        // Perform base recognition
        const state = dc.activeDialog.state as PromptState;
        const recognized = await this.onRecognize(dc.context, state.state, state.options);
        
        // Validate the return value
        let end = false;
        let endResult: any;
        if (this.validator) {
            await this.validator(dc.context, {
                recognized: recognized,
                state: state.state,
                options: state.options,
                end: (output: any) => {
                    if (end) { throw new Error(`PromptValidatorContext.end(): method already called for the turn.`) }
                    end = true;
                    endResult = output;
                }
            });
        } else if (recognized.succeeded) {
            end = true;
            endResult = recognized.value;
        }

        // Return recognized value or re-prompt
        if (end) {
            return await dc.end(endResult);
        } else {
            if (!dc.context.responded) {
                await this.onPrompt(dc.context, state.state, state.options, true);
            }  
            return Dialog.EndOfTurn;
        }
    }

    public async dialogResume(dc: DialogContext, reason: DialogReason, result?: any): Promise<DialogTurnResult> {
        // Prompts are typically leaf nodes on the stack but the dev is free to push other dialogs
        // on top of the stack which will result in the prompt receiving an unexpected call to
        // dialogResume() when the pushed on dialog ends. 
        // To avoid the prompt prematurely ending we need to implement this method and 
        // simply re-prompt the user.
        await this.dialogReprompt(dc.context, dc.activeDialog);
        return Dialog.EndOfTurn;
    }

    public async dialogReprompt(context: TurnContext, instance: DialogInstance): Promise<void> {
        const state = instance.state as PromptState;
        await this.onPrompt(context, state.state, state.options, false);
    }

    protected appendChoices(prompt: string|Partial<Activity>, channelId: string, choices: (string|Choice)[], style: ListStyle, options?: ChoiceFactoryOptions): Partial<Activity> {
        // Get base prompt text (if any)
        let text = '';
        if (typeof prompt === 'string') {
            text = prompt;
        } else if (prompt && prompt.text) {
            text = prompt.text;
        }

        // Create temporary msg
        let msg: Partial<Activity>;
        switch (style)
        {
            case ListStyle.inline:
                msg = ChoiceFactory.inline(choices, text, null, options);
                break;

            case ListStyle.list:
                msg = ChoiceFactory.list(choices, text, null, options);
                break;

            case ListStyle.suggestedAction:
                msg = ChoiceFactory.suggestedAction(choices, text);
                break;

            case ListStyle.none:
                msg = MessageFactory.text(text);
                break;

            default:
                msg = ChoiceFactory.forChannel(channelId, choices, text, null, options);
                break;
        }

        // Update prompt with text and actions
        if (typeof prompt === 'object') {
            prompt.text = msg.text;
            if (msg.suggestedActions && Array.isArray(msg.suggestedActions.actions) && msg.suggestedActions.actions.length > 0)
            {
                prompt.suggestedActions = msg.suggestedActions;
            }

            return prompt;
        } else {
            msg.inputHint = InputHints.ExpectingInput;
            return msg;
        }
    }
}

interface PromptState {
    state: object;
    options: PromptOptions;
}