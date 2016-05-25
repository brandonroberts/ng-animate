import { PostMessageBus, PostMessageBusSink, PostMessageBusSource } from '../web_workers/shared/post_message_bus';
import { MessageBus } from '../web_workers/shared/message_bus';
import { Injector, Injectable, APP_INITIALIZER } from '@angular/core';
import { WORKER_RENDER_APPLICATION_COMMON_PROVIDERS, WORKER_SCRIPT, initializeGenericWorkerRenderer } from './worker_render_common';
import { BaseException } from '../../src/facade/exceptions';
export { WORKER_RENDER_STARTABLE_MESSAGING_SERVICE } from './worker_render_common';
export class WebWorkerInstance {
    /** @internal */
    init(worker, bus) {
        this.worker = worker;
        this.bus = bus;
    }
}
WebWorkerInstance.decorators = [
    { type: Injectable },
];
/**
 * An array of providers that should be passed into `application()` when initializing a new Worker.
 */
export const WORKER_RENDER_APPLICATION_PROVIDERS = [
    WORKER_RENDER_APPLICATION_COMMON_PROVIDERS, WebWorkerInstance,
    /*@ts2dart_Provider*/ {
        provide: APP_INITIALIZER,
        useFactory: (injector => () => initWebWorkerApplication(injector)),
        multi: true,
        deps: [Injector]
    },
    /*@ts2dart_Provider*/ {
        provide: MessageBus,
        useFactory: (instance) => instance.bus,
        deps: [WebWorkerInstance]
    }
];
function initWebWorkerApplication(injector) {
    var scriptUri;
    try {
        scriptUri = injector.get(WORKER_SCRIPT);
    }
    catch (e) {
        throw new BaseException("You must provide your WebWorker's initialization script with the WORKER_SCRIPT token");
    }
    let instance = injector.get(WebWorkerInstance);
    spawnWebWorker(scriptUri, instance);
    initializeGenericWorkerRenderer(injector);
}
/**
 * Spawns a new class and initializes the WebWorkerInstance
 */
function spawnWebWorker(uri, instance) {
    var webWorker = new Worker(uri);
    var sink = new PostMessageBusSink(webWorker);
    var source = new PostMessageBusSource(webWorker);
    var bus = new PostMessageBus(sink, source);
    instance.init(webWorker, bus);
}
//# sourceMappingURL=worker_render.js.map