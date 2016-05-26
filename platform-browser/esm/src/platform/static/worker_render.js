import { PostMessageBus, PostMessageBusSink, PostMessageBusSource } from '../../web_workers/shared/post_message_bus';
import { MessageBus } from '../../web_workers/shared/message_bus';
import { Injector, Injectable, APP_INITIALIZER } from '@angular/core';
import { WORKER_RENDER_APPLICATION_COMMON_PROVIDERS, WORKER_SCRIPT, initializeGenericWorkerRenderer } from '../common/worker_render';
import { BaseException } from '../../../src/facade/exceptions';
import { isPresent } from '../../facade/lang';
import { PromiseWrapper } from '../../facade/async';
import { ApplicationRef, ReflectiveInjector } from '@angular/core';
import { workerRenderPlatform } from '../common/worker_render';
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
export const WORKER_RENDER_STATIC_APPLICATION_PROVIDERS = [
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
export function bootstrapStaticRender(workerScriptUri, customProviders) {
    var app = ReflectiveInjector.resolveAndCreate([
        WORKER_RENDER_STATIC_APPLICATION_PROVIDERS,
        /* @ts2dart_Provider */ { provide: WORKER_SCRIPT, useValue: workerScriptUri },
        isPresent(customProviders) ? customProviders : []
    ], workerRenderPlatform().injector);
    // Return a promise so that we keep the same semantics as Dart,
    // and we might want to wait for the app side to come up
    // in the future...
    return PromiseWrapper.resolve(app.get(ApplicationRef));
}
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