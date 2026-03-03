"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SesChannel = void 0;
/**
 * SesChannel: delivers notifications via AWS SES.
 *
 * Requires `@aws-sdk/client-ses` as a peer dependency in the consuming project.
 * Never throws on delivery failure — returns { success: false, error }.
 */
class SesChannel {
    constructor(config) {
        this.name = 'ses';
        this.config = config;
    }
    async send(recipient, payload) {
        const timestamp = new Date().toISOString();
        try {
            // Dynamic import to avoid requiring @aws-sdk/client-ses at install time
            const { SESClient, SendEmailCommand } = await Promise.resolve().then(() => __importStar(require('@aws-sdk/client-ses')));
            const clientConfig = { region: this.config.region || 'us-east-1' };
            if (this.config.credentials) {
                clientConfig.credentials = this.config.credentials;
            }
            const sesClient = new SESClient(clientConfig);
            const command = new SendEmailCommand({
                Source: this.config.sourceEmail,
                Destination: {
                    ToAddresses: [recipient.email],
                },
                Message: {
                    Subject: { Data: payload.subject || 'Notification' },
                    Body: {
                        ...(payload.htmlBody
                            ? { Html: { Data: payload.htmlBody } }
                            : { Text: { Data: payload.body } }),
                    },
                },
            });
            const result = await sesClient.send(command);
            return {
                success: true,
                channel: this.name,
                messageId: result.MessageId,
                timestamp,
            };
        }
        catch (err) {
            console.error(`[SesChannel] Failed to send to ${recipient.email}:`, err instanceof Error ? err.message : err);
            return {
                success: false,
                channel: this.name,
                error: err instanceof Error ? err.message : String(err),
                timestamp,
            };
        }
    }
}
exports.SesChannel = SesChannel;
