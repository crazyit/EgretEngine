var ts;
(function (ts) {
    var checker;
    var sourceFiles;
    var rootFileNames;
    var dependencyMap;
    var pathWeightMap;
    function createMap() {
        var map = Object.create(null);
        // Using 'delete' on an object causes V8 to put the object in dictionary mode.
        // This disables creation of hidden classes, which are expensive when an object is
        // constantly changing shape.
        map["__"] = undefined;
        delete map["__"];
        return map;
    }
    function reorderSourceFiles(program) {
        sourceFiles = program.getSourceFiles();
        rootFileNames = program.getRootFileNames();
        checker = program.getTypeChecker();
        buildDependencyMap();
        var result = sortOnDependency();
        sourceFiles = null;
        rootFileNames = null;
        checker = null;
        dependencyMap = null;
        return result;
    }
    ts.reorderSourceFiles = reorderSourceFiles;
    function addDependency(file, dependent) {
        if (file == dependent) {
            return;
        }
        var list = dependencyMap[file];
        if (!list) {
            list = dependencyMap[file] = [];
        }
        if (list.indexOf(dependent) == -1) {
            list.push(dependent);
        }
    }
    function buildDependencyMap() {
        dependencyMap = createMap();
        for (var i = 0; i < sourceFiles.length; i++) {
            var sourceFile = sourceFiles[i];
            if (sourceFile.isDeclarationFile) {
                continue;
            }
            visitFile(sourceFile);
        }
    }
    function visitFile(sourceFile) {
        var statements = sourceFile.statements;
        var length = statements.length;
        for (var i = 0; i < length; i++) {
            var statement = statements[i];
            if (ts.hasModifier(statement, 2 /* Ambient */)) {
                continue;
            }
            visitStatement(statements[i]);
        }
    }
    function visitStatement(statement) {
        if (!statement) {
            return;
        }
        switch (statement.kind) {
            case 210 /* ExpressionStatement */:
                var expression = statement;
                visitExpression(expression.expression);
                break;
            case 229 /* ClassDeclaration */:
                checkInheriting(statement);
                visitStaticMember(statement);
                if (statement.transformFlags & 4096 /* ContainsDecorators */) {
                    visitClassDecorators(statement);
                }
                break;
            case 208 /* VariableStatement */:
                visitVariableList(statement.declarationList);
                break;
            case 237 /* ImportEqualsDeclaration */:
                var importDeclaration = statement;
                checkDependencyAtLocation(importDeclaration.moduleReference);
                break;
            case 233 /* ModuleDeclaration */:
                visitModule(statement);
                break;
            case 207 /* Block */:
                visitBlock(statement);
                break;
            case 211 /* IfStatement */:
                var ifStatement = statement;
                visitExpression(ifStatement.expression);
                visitStatement(ifStatement.thenStatement);
                visitStatement(ifStatement.elseStatement);
                break;
            case 212 /* DoStatement */:
            case 213 /* WhileStatement */:
            case 220 /* WithStatement */:
                var doStatement = statement;
                visitExpression(doStatement.expression);
                visitStatement(doStatement.statement);
                break;
            case 214 /* ForStatement */:
                var forStatement = statement;
                visitExpression(forStatement.condition);
                visitExpression(forStatement.incrementor);
                if (forStatement.initializer) {
                    if (forStatement.initializer.kind === 227 /* VariableDeclarationList */) {
                        visitVariableList(forStatement.initializer);
                    }
                    else {
                        visitExpression(forStatement.initializer);
                    }
                }
                break;
            case 215 /* ForInStatement */:
            case 216 /* ForOfStatement */:
                var forInStatement = statement;
                visitExpression(forInStatement.expression);
                if (forInStatement.initializer) {
                    if (forInStatement.initializer.kind === 227 /* VariableDeclarationList */) {
                        visitVariableList(forInStatement.initializer);
                    }
                    else {
                        visitExpression(forInStatement.initializer);
                    }
                }
                break;
            case 219 /* ReturnStatement */:
                visitExpression(statement.expression);
                break;
            case 221 /* SwitchStatement */:
                var switchStatment = statement;
                visitExpression(switchStatment.expression);
                switchStatment.caseBlock.clauses.forEach(function (element) {
                    if (element.kind === 257 /* CaseClause */) {
                        visitExpression(element.expression);
                    }
                    element.statements.forEach(function (element) {
                        visitStatement(element);
                    });
                });
                break;
            case 222 /* LabeledStatement */:
                visitStatement(statement.statement);
                break;
            case 223 /* ThrowStatement */:
                visitExpression(statement.expression);
                break;
            case 224 /* TryStatement */:
                var tryStatement = statement;
                visitBlock(tryStatement.tryBlock);
                visitBlock(tryStatement.finallyBlock);
                if (tryStatement.catchClause) {
                    visitBlock(tryStatement.catchClause.block);
                }
                break;
        }
    }
    function visitModule(node) {
        if (node.body.kind === 233 /* ModuleDeclaration */) {
            visitModule(node.body);
            return;
        }
        if (node.body.kind === 234 /* ModuleBlock */) {
            for (var _i = 0, _a = node.body.statements; _i < _a.length; _i++) {
                var statement = _a[_i];
                if (ts.hasModifier(statement, 2 /* Ambient */)) {
                    continue;
                }
                visitStatement(statement);
            }
        }
    }
    function checkDependencyAtLocation(node) {
        var symbol = checker.getSymbolAtLocation(node);
        if (!symbol || !symbol.declarations) {
            return;
        }
        var sourceFile = getSourceFileOfNode(symbol.declarations[0]);
        if (!sourceFile || sourceFile.isDeclarationFile) {
            return;
        }
        addDependency(getSourceFileOfNode(node).fileName, sourceFile.fileName);
    }
    function checkInheriting(node) {
        if (!node.heritageClauses) {
            return;
        }
        var heritageClause = null;
        for (var _i = 0, _a = node.heritageClauses; _i < _a.length; _i++) {
            var clause = _a[_i];
            if (clause.token === 85 /* ExtendsKeyword */) {
                heritageClause = clause;
                break;
            }
        }
        if (!heritageClause) {
            return;
        }
        var superClasses = heritageClause.types;
        if (!superClasses) {
            return;
        }
        superClasses.forEach(function (superClass) {
            checkDependencyAtLocation(superClass.expression);
        });
    }
    function visitStaticMember(node) {
        var members = node.members;
        if (!members) {
            return;
        }
        for (var _i = 0, members_4 = members; _i < members_4.length; _i++) {
            var member = members_4[_i];
            if (!ts.hasModifier(member, 32 /* Static */)) {
                continue;
            }
            if (member.kind == 149 /* PropertyDeclaration */) {
                var property = member;
                visitExpression(property.initializer);
            }
        }
    }
    function visitClassDecorators(node) {
        if (node.decorators) {
            visitDecorators(node.decorators);
        }
        var members = node.members;
        if (!members) {
            return;
        }
        for (var _i = 0, members_5 = members; _i < members_5.length; _i++) {
            var member = members_5[_i];
            var decorators = void 0;
            var functionLikeMember = void 0;
            if (member.kind === 153 /* GetAccessor */ || member.kind === 154 /* SetAccessor */) {
                var accessors = ts.getAllAccessorDeclarations(node.members, member);
                if (member !== accessors.firstAccessor) {
                    continue;
                }
                decorators = accessors.firstAccessor.decorators;
                if (!decorators && accessors.secondAccessor) {
                    decorators = accessors.secondAccessor.decorators;
                }
                functionLikeMember = accessors.setAccessor;
            }
            else {
                decorators = member.decorators;
                if (member.kind === 151 /* MethodDeclaration */) {
                    functionLikeMember = member;
                }
            }
            if (decorators) {
                visitDecorators(decorators);
            }
            if (functionLikeMember) {
                for (var _a = 0, _b = functionLikeMember.parameters; _a < _b.length; _a++) {
                    var parameter = _b[_a];
                    if (parameter.decorators) {
                        visitDecorators(parameter.decorators);
                    }
                }
            }
        }
    }
    function visitDecorators(decorators) {
        for (var _i = 0, decorators_2 = decorators; _i < decorators_2.length; _i++) {
            var decorator = decorators_2[_i];
            visitExpression(decorator.expression);
        }
    }
    function visitExpression(expression) {
        if (!expression) {
            return;
        }
        switch (expression.kind) {
            case 182 /* NewExpression */:
            case 181 /* CallExpression */:
                visitCallExpression(expression);
                break;
            case 71 /* Identifier */:
                checkDependencyAtLocation(expression);
                break;
            case 179 /* PropertyAccessExpression */:
                checkDependencyAtLocation(expression);
                break;
            case 180 /* ElementAccessExpression */:
                visitExpression(expression.expression);
                break;
            case 178 /* ObjectLiteralExpression */:
                visitObjectLiteralExpression(expression);
                break;
            case 177 /* ArrayLiteralExpression */:
                var arrayLiteral = expression;
                arrayLiteral.elements.forEach(visitExpression);
                break;
            case 196 /* TemplateExpression */:
                var template = expression;
                template.templateSpans.forEach(function (span) {
                    visitExpression(span.expression);
                });
                break;
            case 185 /* ParenthesizedExpression */:
                var parenthesized = expression;
                visitExpression(parenthesized.expression);
                break;
            case 194 /* BinaryExpression */:
                visitBinaryExpression(expression);
                break;
            case 193 /* PostfixUnaryExpression */:
            case 192 /* PrefixUnaryExpression */:
                visitExpression(expression.operand);
                break;
            case 188 /* DeleteExpression */:
                visitExpression(expression.expression);
                break;
        }
        // TaggedTemplateExpression
        // TypeAssertionExpression
        // FunctionExpression
        // ArrowFunction
        // TypeOfExpression
        // VoidExpression
        // AwaitExpression
        // ConditionalExpression
        // YieldExpression
        // SpreadElementExpression
        // ClassExpression
        // OmittedExpression
        // ExpressionWithTypeArguments
        // AsExpression
        // NonNullExpression
    }
    function visitBinaryExpression(binary) {
        var left = binary.left;
        var right = binary.right;
        visitExpression(left);
        visitExpression(right);
        if (binary.operatorToken.kind === 58 /* EqualsToken */ &&
            (left.kind === 71 /* Identifier */ || left.kind === 179 /* PropertyAccessExpression */) &&
            (right.kind === 71 /* Identifier */ || right.kind === 179 /* PropertyAccessExpression */)) {
            var symbol = checker.getSymbolAtLocation(left);
            if (!symbol || !symbol.declarations) {
                return;
            }
            for (var _i = 0, _a = symbol.declarations; _i < _a.length; _i++) {
                var declaration = _a[_i];
                if (declaration.kind === 226 /* VariableDeclaration */ || declaration.kind === 149 /* PropertyDeclaration */) {
                    var variable = declaration;
                    if (variable.initializer) {
                        continue;
                    }
                    if (!variable.delayInitializerList) {
                        variable.delayInitializerList = [];
                    }
                    variable.delayInitializerList.push(right);
                    if (variable.callerList) {
                        for (var _b = 0, _c = variable.callerList; _b < _c.length; _b++) {
                            var callerFileName = _c[_b];
                            checkCallTarget(callerFileName, right);
                        }
                    }
                }
            }
        }
    }
    function visitObjectLiteralExpression(objectLiteral) {
        objectLiteral.properties.forEach(function (element) {
            switch (element.kind) {
                case 261 /* PropertyAssignment */:
                    visitExpression(element.initializer);
                    break;
                case 262 /* ShorthandPropertyAssignment */:
                    visitExpression(element.objectAssignmentInitializer);
                    break;
                case 263 /* SpreadAssignment */:
                    visitExpression(element.expression);
                    break;
            }
        });
    }
    function visitCallExpression(callExpression) {
        if (callExpression.arguments) {
            callExpression.arguments.forEach(function (argument) {
                visitExpression(argument);
            });
        }
        var expression = escapeParenthesized(callExpression.expression);
        visitExpression(expression);
        switch (expression.kind) {
            case 186 /* FunctionExpression */:
                var functionExpression = expression;
                visitBlock(functionExpression.body);
                break;
            case 179 /* PropertyAccessExpression */:
            case 71 /* Identifier */:
                var callerFileName = getSourceFileOfNode(callExpression).fileName;
                checkCallTarget(callerFileName, expression);
                break;
        }
    }
    function escapeParenthesized(expression) {
        if (expression.kind === 185 /* ParenthesizedExpression */) {
            return escapeParenthesized(expression.expression);
        }
        return expression;
    }
    function checkCallTarget(callerFileName, target) {
        var declarations = [];
        getForwardDeclarations(target, declarations, callerFileName);
        for (var _i = 0, declarations_10 = declarations; _i < declarations_10.length; _i++) {
            var declaration = declarations_10[_i];
            var sourceFile = getSourceFileOfNode(declaration);
            if (!sourceFile || sourceFile.isDeclarationFile) {
                return;
            }
            addDependency(callerFileName, sourceFile.fileName);
            if (declaration.kind === 228 /* FunctionDeclaration */ ||
                declaration.kind === 151 /* MethodDeclaration */) {
                visitBlock(declaration.body);
            }
            else if (declaration.kind === 229 /* ClassDeclaration */) {
                checkClassInstantiation(declaration);
            }
        }
    }
    function getForwardDeclarations(reference, declarations, callerFileName) {
        var symbol = checker.getSymbolAtLocation(reference);
        if (!symbol || !symbol.declarations) {
            return;
        }
        for (var _i = 0, _a = symbol.declarations; _i < _a.length; _i++) {
            var declaration = _a[_i];
            switch (declaration.kind) {
                case 228 /* FunctionDeclaration */:
                case 151 /* MethodDeclaration */:
                case 229 /* ClassDeclaration */:
                    if (declarations.indexOf(declaration) == -1) {
                        declarations.push(declaration);
                    }
                    break;
                case 237 /* ImportEqualsDeclaration */:
                    getForwardDeclarations(declaration.moduleReference, declarations, callerFileName);
                    break;
                case 226 /* VariableDeclaration */:
                case 149 /* PropertyDeclaration */:
                    var variable = declaration;
                    var initializer = variable.initializer;
                    if (initializer) {
                        if (initializer.kind === 71 /* Identifier */ || initializer.kind === 179 /* PropertyAccessExpression */) {
                            getForwardDeclarations(initializer, declarations, callerFileName);
                        }
                    }
                    else {
                        if (variable.delayInitializerList) {
                            for (var _b = 0, _c = variable.delayInitializerList; _b < _c.length; _b++) {
                                var expression = _c[_b];
                                getForwardDeclarations(expression, declarations, callerFileName);
                            }
                        }
                        if (variable.callerList) {
                            if (variable.callerList.indexOf(callerFileName) == -1) {
                                variable.callerList.push(callerFileName);
                            }
                        }
                        else {
                            variable.callerList = [callerFileName];
                        }
                    }
                    break;
            }
        }
    }
    function checkReferenceOfCallExpression(reference) {
        var symbol = checker.getSymbolAtLocation(reference);
        if (!symbol || !symbol.declarations) {
            return;
        }
        var fileName = getSourceFileOfNode(reference).fileName;
        for (var _i = 0, _a = symbol.declarations; _i < _a.length; _i++) {
            var declaration = _a[_i];
            var sourceFile = getSourceFileOfNode(declaration);
            if (!sourceFile) {
                continue;
            }
            addDependency(fileName, sourceFile.fileName);
            switch (declaration.kind) {
                case 228 /* FunctionDeclaration */:
                case 151 /* MethodDeclaration */:
                    visitBlock(declaration.body);
                    break;
                case 229 /* ClassDeclaration */:
                    checkClassInstantiation(declaration);
                    break;
                case 237 /* ImportEqualsDeclaration */:
                    checkReferenceOfCallExpression(declaration.moduleReference);
                    break;
                case 226 /* VariableDeclaration */:
                    break;
            }
        }
    }
    function checkClassInstantiation(node) {
        var members = node.members;
        if (!members) {
            return;
        }
        for (var _i = 0, members_6 = members; _i < members_6.length; _i++) {
            var member = members_6[_i];
            if (ts.hasModifier(member, 32 /* Static */)) {
                continue;
            }
            if (member.kind === 149 /* PropertyDeclaration */) {
                var property = member;
                visitExpression(property.initializer);
            }
            else if (member.kind === 152 /* Constructor */) {
                var constructor = member;
                visitBlock(constructor.body);
            }
        }
    }
    function visitBlock(block) {
        if (!block || block.visitedBySorting) {
            return;
        }
        block.visitedBySorting = true;
        for (var _i = 0, _a = block.statements; _i < _a.length; _i++) {
            var statement = _a[_i];
            visitStatement(statement);
        }
    }
    function visitVariableList(variables) {
        if (!variables) {
            return;
        }
        variables.declarations.forEach(function (declaration) {
            visitExpression(declaration.initializer);
        });
    }
    function sortOnDependency() {
        var result = {};
        result.sortedFileNames = [];
        result.circularReferences = [];
        pathWeightMap = createMap();
        var dtsFiles = [];
        var tsFiles = [];
        for (var _i = 0, sourceFiles_2 = sourceFiles; _i < sourceFiles_2.length; _i++) {
            var sourceFile = sourceFiles_2[_i];
            var path = sourceFile.fileName;
            if (sourceFile.isDeclarationFile) {
                pathWeightMap[path] = 10000;
                dtsFiles.push(sourceFile);
                continue;
            }
            var references = updatePathWeight(path, 0, [path]);
            if (references) {
                result.circularReferences = references;
                break;
            }
            tsFiles.push(sourceFile);
        }
        if (result.circularReferences.length === 0) {
            tsFiles.sort(function (a, b) {
                return pathWeightMap[b.fileName] - pathWeightMap[a.fileName];
            });
            sourceFiles.length = 0;
            rootFileNames.length = 0;
            dtsFiles.concat(tsFiles).forEach(function (sourceFile) {
                sourceFiles.push(sourceFile);
                rootFileNames.push(sourceFile.fileName);
                result.sortedFileNames.push(sourceFile.fileName);
            });
        }
        pathWeightMap = null;
        return result;
    }
    function updatePathWeight(path, weight, references) {
        if (pathWeightMap[path] === undefined) {
            pathWeightMap[path] = weight;
        }
        else {
            if (pathWeightMap[path] < weight) {
                pathWeightMap[path] = weight;
            }
            else {
                return null;
            }
        }
        var list = dependencyMap[path];
        if (!list) {
            return null;
        }
        for (var _i = 0, list_2 = list; _i < list_2.length; _i++) {
            var parentPath = list_2[_i];
            if (references.indexOf(parentPath) != -1) {
                references.push(parentPath);
                return references;
            }
            var result = updatePathWeight(parentPath, weight + 1, references.concat(parentPath));
            if (result) {
                return result;
            }
        }
        return null;
    }
    function getSourceFileOfNode(node) {
        while (node && node.kind !== 265 /* SourceFile */) {
            node = node.parent;
        }
        return node;
    }
})(ts || (ts = {}));
/// <reference path="checker.ts"/>
/* @internal */