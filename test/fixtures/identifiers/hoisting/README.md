## [JavaScript Hoisting](https://developer.mozilla.org/en-US/docs/Glossary/Hoisting)

The JS interpreter hoists `VariableDeclaration` and `FunctionDeclaration` nodes to the top of their containing scope. There are two types that are not subject to runtime errors:

- Value Hoisting: `function` declarations can be referenced and invoked before their declarations.
- Declaration Hoisting: `var` declarations can be referenced before their declarations with a default value of `undefined`.

The other types of hoisting are ignored by this package for the following reasons:

- The [Temporal Dead Zone](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/let#temporal_dead_zone_tdz) (TDZ) causes a runtime error when referencing `let`/`const`/`class` identifiers before their declarations.
- [Hoisting of `import` declarations](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules#import_declarations_are_hoisted) when converting from ESM to CJS is less subject to identifier collisions because `export` statements are not part of a `MemberExpression` (`exports.foo`) node, so a SyntaxError will be thrown for duplicate identifiers. Hence, it's not as important to track reads of import identifiers before they are imported.

> [!NOTE]  
> In strict mode, function declarations are not hoisted outside of `BlockStatement` nodes, but `var` declarations are.
>
> This package assumes strict mode.

## Goal

To correctly record references of identifiers before they are declared to avoid walking the AST twice (once for recording declarations, and again for when they are referenced).
