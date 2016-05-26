import { Type } from '../../src/facade/lang';
import { ComponentFactory } from './component_factory';
/**
 * Low-level service for loading {@link ComponentFactory}s, which
 * can later be used to create and render a Component instance.
 * @experimental
 */
export declare abstract class ComponentResolver {
    abstract resolveComponent(component: Type | string): Promise<ComponentFactory<any>>;
    abstract clearCache(): any;
}
export declare class ReflectorComponentResolver extends ComponentResolver {
    resolveComponent(component: Type | string): Promise<ComponentFactory<any>>;
    clearCache(): void;
}
