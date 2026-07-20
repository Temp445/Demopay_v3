import { ExpressionTemplate } from './types';

export class DependencyResolver {
  public static resolveDependencies(expressions: ExpressionTemplate[]): ExpressionTemplate[] {
    const graph = this.buildDependencyGraph(expressions);
    const sorted = this.topologicalSort(graph, expressions);
    return sorted;
  }
 
  private static buildDependencyGraph(
    expressions: ExpressionTemplate[]
  ): Map<string, Set<string>> {
    const graph = new Map<string, Set<string>>();

    for (const expr of expressions) {
      if (!graph.has(expr.name)) {
        graph.set(expr.name, new Set());
      }

      for (const dep of expr.dependencies) {
        const dependencies = graph.get(expr.name)!;
        dependencies.add(dep);
      }
    }

    return graph;
  }

  private static topologicalSort(
    graph: Map<string, Set<string>>,
    expressions: ExpressionTemplate[]
  ): ExpressionTemplate[] {
    const exprMap = new Map(expressions.map((e) => [e.name, e]));
    const visited = new Set<string>();
    const tempMark = new Set<string>();
    const result: ExpressionTemplate[] = [];

    const visit = (name: string): void => {
      if (tempMark.has(name)) {
        throw new Error(`Circular dependency detected involving: ${name}`);
      }

      if (!visited.has(name)) {
        tempMark.add(name);

        const dependencies = graph.get(name) || new Set();
        for (const dep of dependencies) {
          visit(dep);
        }

        tempMark.delete(name);
        visited.add(name);

        const expr = exprMap.get(name);
        if (expr) {
          result.unshift(expr);
        }
      }
    };

    for (const expr of expressions) {
      if (!visited.has(expr.name)) {
        visit(expr.name);
      }
    }

    return result;
  }

  public static getDependencyOrder(componentNames: string[], dependencies: Map<string, string[]>): string[] {
    const graph = new Map<string, Set<string>>();

    for (const name of componentNames) {
      if (!graph.has(name)) {
        graph.set(name, new Set());
      }

      const deps = dependencies.get(name) || [];
      for (const dep of deps) {
        graph.get(name)!.add(dep);
      }
    }

    const visited = new Set<string>();
    const tempMark = new Set<string>();
    const result: string[] = [];

    const visit = (name: string): void => {
      if (tempMark.has(name)) {
        throw new Error(`Circular dependency detected: ${name}`);
      }

      if (!visited.has(name)) {
        tempMark.add(name);

        const deps = graph.get(name) || new Set();
        for (const dep of deps) {
          if (componentNames.includes(dep)) {
            visit(dep);
          }
        }

        tempMark.delete(name);
        visited.add(name);
        result.unshift(name);
      }
    };

    for (const name of componentNames) {
      if (!visited.has(name)) {
        visit(name);
      }
    }

    return result;
  }

  public static validateNoCycles(componentName: string, dependencies: string[], allDependencies: Map<string, string[]>): boolean {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycle = (current: string): boolean => {
      if (recursionStack.has(current)) {
        return true;
      }

      if (visited.has(current)) {
        return false;
      }

      visited.add(current);
      recursionStack.add(current);

      const deps = allDependencies.get(current) || [];
      for (const dep of deps) {
        if (hasCycle(dep)) {
          return true;
        }
      }

      recursionStack.delete(current);
      return false;
    };

    const tempDeps = new Map(allDependencies);
    tempDeps.set(componentName, dependencies);

    return !hasCycle(componentName);
  }
}
