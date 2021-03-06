/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */
import * as url from 'url';
import { IQnAService, ServiceTypes } from '../schema';
import { ConnectedService } from './connectedService';

export class QnaMakerService extends ConnectedService implements IQnAService {
    public kbId = '';
    public subscriptionKey = '';
    public hostname = '';
    public endpointKey = '';

    constructor(source: IQnAService = {} as IQnAService) {
        super(source, ServiceTypes.QnA);
        let { id = '', name = '', kbId = '', subscriptionKey = '', endpointKey = '', hostname = '' } = source;
        if (hostname) {
            hostname = url.resolve(hostname, '/qnamaker');
        }
        Object.assign(this, { id, name, kbId, subscriptionKey, endpointKey, hostname });
    }

    public toJSON(): IQnAService {
        const { type, id, name, kbId, subscriptionKey, endpointKey, hostname } = this;
        return { type, id, name, kbId, subscriptionKey, endpointKey, hostname };
    }

    // encrypt keys in service
    public encrypt(secret: string, encryptString: (value: string, secret:string) => string): void {
        if (this.endpointKey && this.endpointKey.length > 0)
            this.endpointKey = encryptString(this.endpointKey, secret);

        if (this.subscriptionKey && this.subscriptionKey.length > 0)
            this.subscriptionKey = encryptString(this.subscriptionKey, secret);
    }

    // decrypt keys in service
    public decrypt(secret: string, decryptString: (value: string, secret:string) => string): void {
        if (this.endpointKey && this.endpointKey.length > 0)
            this.endpointKey = decryptString(this.endpointKey, secret);

        if (this.subscriptionKey && this.subscriptionKey.length > 0)
            this.subscriptionKey = decryptString(this.subscriptionKey, secret);
    }

}
