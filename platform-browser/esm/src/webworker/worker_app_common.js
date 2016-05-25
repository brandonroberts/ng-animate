import { WebWorkerRootRenderer } from '../web_workers/worker/renderer';
import { print } from '../../src/facade/lang';
import { PLATFORM_DIRECTIVES, PLATFORM_PIPES, ExceptionHandler, APPLICATION_COMMON_PROVIDERS, PLATFORM_COMMON_PROVIDERS, OpaqueToken, RootRenderer } from '@angular/core';
import { COMMON_DIRECTIVES, COMMON_PIPES, FORM_PROVIDERS } from '@angular/common';
import { ClientMessageBrokerFactory, ClientMessageBrokerFactory_ } from '../web_workers/shared/client_message_broker';
import { ServiceMessageBrokerFactory, ServiceMessageBrokerFactory_ } from '../web_workers/shared/service_message_broker';
import { Serializer } from '../web_workers/shared/serializer';
import { ON_WEB_WORKER } from '../web_workers/shared/api';
import { RenderStore } from '../web_workers/shared/render_store';
import { BROWSER_SANITIZATION_PROVIDERS } from '../browser_common';
class PrintLogger {
    constructor() {
        this.log = print;
        this.logError = print;
        this.logGroup = print;
    }
    logGroupEnd() { }
}
export const WORKER_APP_PLATFORM_MARKER = 
/*@ts2dart_const*/ new OpaqueToken('WorkerAppPlatformMarker');
export const WORKER_APP_PLATFORM_PROVIDERS = 
/*@ts2dart_const*/ [
    PLATFORM_COMMON_PROVIDERS,
    /*@ts2dart_const*/ (
    /* @ts2dart_Provider */ { provide: WORKER_APP_PLATFORM_MARKER, useValue: true })
];
export const WORKER_APP_APPLICATION_COMMON_PROVIDERS = 
/*@ts2dart_const*/ [
    APPLICATION_COMMON_PROVIDERS,
    FORM_PROVIDERS,
    BROWSER_SANITIZATION_PROVIDERS,
    Serializer,
    /* @ts2dart_Provider */ { provide: PLATFORM_PIPES, useValue: COMMON_PIPES, multi: true },
    /* @ts2dart_Provider */ { provide: PLATFORM_DIRECTIVES, useValue: COMMON_DIRECTIVES, multi: true },
    /* @ts2dart_Provider */ { provide: ClientMessageBrokerFactory, useClass: ClientMessageBrokerFactory_ },
    /* @ts2dart_Provider */ { provide: ServiceMessageBrokerFactory, useClass: ServiceMessageBrokerFactory_ },
    WebWorkerRootRenderer,
    /* @ts2dart_Provider */ { provide: RootRenderer, useExisting: WebWorkerRootRenderer },
    /* @ts2dart_Provider */ { provide: ON_WEB_WORKER, useValue: true },
    RenderStore,
    /* @ts2dart_Provider */ { provide: ExceptionHandler, useFactory: _exceptionHandler, deps: [] }
];
function _exceptionHandler() {
    return new ExceptionHandler(new PrintLogger());
}
//# sourceMappingURL=worker_app_common.js.map