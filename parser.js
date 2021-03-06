(function(module) {

    var tree = {
        evalEnv : require('./lib/evalEnv.js'),
        importVisitor : require('./lib/importVisitor.js'),
        joinSelectorVisitor : require('./lib/joinSelectorVisitor.js'),
        mixin : require('./lib/mixin.js'),
        processExtendsVisitor : require('./lib/processExtendsVisitor.js'),
        parseEnv : require('./lib/parseEnv.js'),
        Alpha : require('./lib/alpha.js'),
        Anonymous : require('./lib/anonymous.js'),
        Assignment : require('./lib/assignment.js'),
        Attribute : require('./lib/attribute.js'),
        Call : require('./lib/call.js'),
        Color : require('./lib/color.js'),
        Condition : require('./lib/condition.js'),
        Combinator : require('./lib/combinator.js'),
        Comment : require('./lib/comment.js'),
        Dimension : require('./lib/dimension.js'),
        Directive : require('./lib/directive.js'),
        Element : require('./lib/element.js'),
        Extend : require('./lib/extend.js'),
        Expression : require('./lib/expression.js'),
        Import : require('./lib/import.js'),
        JavaScript : require('./lib/javascript.js'),
        Keyword : require('./lib/keyword.js'),
        Media : require('./lib/media.js'),
        Negative : require('./lib/negative.js'),
        Operation : require('./lib/operation.js'),
        Paren : require('./lib/paren.js'),
        Quoted : require('./lib/quoted.js'),
        Rule : require('./lib/rule.js'),
        Ruleset : require('./lib/ruleset.js'),
        Selector : require('./lib/selector.js'),
        UnicodeDescriptor : require('./lib/unicodeDescriptor.js'),
        URL : require('./lib/url.js'),
        Value : require('./lib/value.js'),
        Variable : require('./lib/variable.js')
    };

    var Parser = function (env) {
        var input,       // LeSS input string
            i,           // current index in `input`
            j,           // current chunk
            temp,        // temporarily holds a chunk's state, for backtracking
            memo,        // temporarily holds `i`, when backtracking
            furthest,    // furthest index the parser has gone to
            chunks,      // chunkified input
            current,     // index of current chunk, in `input`
            parser;

        var that = this;
        if (!(env instanceof tree.parseEnv)) {
            env = new tree.parseEnv(env);
        }

        var imports = this.imports = {
            paths: env.paths || [],  // Search paths, when importing
            queue: [],               // Files which haven't been imported yet
            files: env.files,        // Holds the imported parse trees
            contents: env.contents,  // Holds the imported file contents
            mime:  env.mime,         // MIME type of .less files
            error: null,             // Error in parsing/evaluating an import
            push: function (path, currentFileInfo, callback) {
                var parserImporter = this;
                this.queue.push(path);
                Parser.importer(path, currentFileInfo, function (e, root, fullPath) {
                    parserImporter.queue.splice(parserImporter.queue.indexOf(path), 1);
                    var imported = fullPath in parserImporter.files;
                    parserImporter.files[fullPath] = root;
                    if (e && !parserImporter.error) { parserImporter.error = e; }
                    callback(e, root, imported);
                }, env);
            }
        };

        var save = function() {
            temp = chunks[j];
            memo = i;
            current = i;
        };

        var restore = function() {
            chunks[j] = temp;
            i = memo;
            current = i;
        };

        var sync = function() {
            if (i > current) {
                chunks[j] = chunks[j].slice(i - current);
                current = i;
            }
        };

        var isWhitespace = function(c) {
            var code = c.charCodeAt(0);
            return code === 32 || code === 10 || code === 9;
        };

        var $ = function(tok) {
            var match, args, length, index, k;
            if (tok instanceof Function) {
                return tok.call(parser.parsers);
            } else if (typeof(tok) === 'string') {
                match = input.charAt(i) === tok ? tok : null;
                length = 1;
                sync ();
            } else {
                sync ();
                if (match = tok.exec(chunks[j])) {
                    length = match[0].length;
                } else {
                    return null;
                }
            }
            if (match) {
                skipWhitespace(length);
                if(typeof(match) === 'string') {
                    return match;
                } else {
                    return match.length === 1 ? match[0] : match;
                }
            }
        };

        var skipWhitespace = function(length) {
            var oldi = i, oldj = j,
                endIndex = i + chunks[j].length,
                mem = i += length;
            while (i < endIndex) {
                if (! isWhitespace(input.charAt(i))) { break }
                i++;
            }
            chunks[j] = chunks[j].slice(length + (i - mem));
            current = i;
            if (chunks[j].length === 0 && j < chunks.length - 1) { j++ }
            return oldi !== i || oldj !== j;
        };

        var expect = function(arg, msg) {
            var result = $(arg);
            if (! result) {
                error(msg || (typeof(arg) === 'string' ? "expected '" + arg + "' got '" + input.charAt(i) + "'" : "unexpected token"));
            } else {
                return result;
            }
        };

        var error = function(msg, type) {
            var e = new Error(msg);
            e.index = i;
            e.type = type || 'Syntax';
            throw e;
        };

        var peek = function(tok) {
            if (typeof(tok) === 'string') {
                return input.charAt(i) === tok;
            } else {
                if (tok.test(chunks[j])) {
                    return true;
                } else {
                    return false;
                }
            }
        }

        var getInput = function(e, env) {
            if (e.filename && env.currentFileInfo.filename && (e.filename !== env.currentFileInfo.filename)) {
                return parser.imports.contents[e.filename];
            } else {
                return input;
            }
        };

        var getLocation = function(index, input) {
            for (var n = index, column = -1; n >= 0 && input.charAt(n) !== '\n'; n--) {
                column++
            }
            return {
                line : typeof(index) === 'number' ? (input.slice(0, index).match(/\n/g) || "").length : null,
                column : column
            };
        }

        var getDebugInfo = function(index, inputStream, env) {
            var filename = require('path').resolve(filename);
            return {
                lineNumber: getLocation(index, inputStream).line + 1,
                fileName: filename
            };
        };

        var LessError = function(e, env) {
            var input = getInput(e, env),
                loc = getLocation(e.index, input),
                line = loc.line,
                col  = loc.column,
                lines = input.split('\n');
            this.type = e.type || 'Syntax';
            this.message = e.message;
            this.filename = e.filename || env.currentFileInfo.filename;
            this.index = e.index;
            this.line = typeof(line) === 'number' ? line + 1 : null;
            this.callLine = e.call && (getLocation(e.call, input).line + 1);
            this.callExtract = lines[getLocation(e.call, input).line];
            this.stack = e.stack;
            this.column = col;
            this.extract = [
                lines[line - 1],
                lines[line],
                lines[line + 1]
            ];
        };

        LessError.prototype = new Error();
        LessError.prototype.constructor = LessError;

        this.env = env = env || {};
        this.optimization = ('optimization' in this.env) ? this.env.optimization : 1;

        return parser = {
            imports: imports,
            parse: function (str, callback) {
                var root, start, end, zone, line, lines, buff = [], c, error = null;
                i = j = current = furthest = 0;
                input = str.replace(/\r\n/g, '\n');
                input = input.replace(/^\uFEFF/, '');
                chunks = (function (chunks) {
                    var j = 0,
                        skip = /(?:@\{[\w-]+\}|[^"'`\{\}\/\(\)\\])+/g,
                        comment = /\/\*(?:[^*]|\*+[^\/*])*\*+\/|\/\/.*/g,
                        string = /"((?:[^"\\\r\n]|\\.)*)"|'((?:[^'\\\r\n]|\\.)*)'|`((?:[^`]|\\.)*)`/g,
                        level = 0,
                        match,
                        chunk = chunks[0],
                        inParam;

                    for (var i = 0, c, cc; i < input.length;) {
                        skip.lastIndex = i;
                        if (match = skip.exec(input)) {
                            if (match.index === i) {
                                i += match[0].length;
                                chunk.push(match[0]);
                            }
                        }
                        c = input.charAt(i);
                        comment.lastIndex = string.lastIndex = i;
                        if (match = string.exec(input)) {
                            if (match.index === i) {
                                i += match[0].length;
                                chunk.push(match[0]);
                                continue;
                            }
                        }
                        if (!inParam && c === '/') {
                            cc = input.charAt(i + 1);
                            if (cc === '/' || cc === '*') {
                                if (match = comment.exec(input)) {
                                    if (match.index === i) {
                                        i += match[0].length;
                                        chunk.push(match[0]);
                                        continue;
                                    }
                                }
                            }
                        }
                        switch (c) {
                            case '{': if (! inParam) { level ++;        chunk.push(c);                           break }
                            case '}': if (! inParam) { level --;        chunk.push(c); chunks[++j] = chunk = []; break }
                            case '(': if (! inParam) { inParam = true;  chunk.push(c);                           break }
                            case ')': if (  inParam) { inParam = false; chunk.push(c);                           break }
                            default:                                    chunk.push(c);
                        }
                        i++;
                    }
                    if (level != 0) {
                        error = new LessError({
                            index: i-1,
                            type: 'Parse',
                            message: (level > 0) ? "missing closing `}`" : "missing opening `{`",
                            filename: env.currentFileInfo.filename
                        }, env);
                    }
                    return chunks.map(function (c) { return c.join('') });;
                })([[]]);
                if (error) {
                    return callback(new LessError(error, env));
                }
                try {
                    root = new tree.Ruleset([], $(this.parsers.primary));
                    root.root = true;
                    root.firstRoot = true;
                } catch (e) {
                    throw e;
                    return callback(new(LessError)(e, env));
                }

                root.toCSS = (function (evaluate) {
                    var line, lines, column;
                    return function (options, variables) {
                        options = options || {};
                        var importError,
                            evalEnv = new tree.evalEnv(options);
                        if (typeof(variables) === 'object' && !Array.isArray(variables)) {
                            variables = Object.keys(variables).map(function (k) {
                                var value = variables[k];
                                if (! (value instanceof tree.Value)) {
                                    if (! (value instanceof tree.Expression)) {
                                        value = new(tree.Expression)([value]);
                                    }
                                    value = new(tree.Value)([value]);
                                }
                                return new(tree.Rule)('@' + k, value, false, 0);
                            });
                            evalEnv.frames = [new(tree.Ruleset)(null, variables)];
                        }
                        try {
                            var evaldRoot = evaluate.call(this, evalEnv);
                            new(tree.joinSelectorVisitor)()
                                .run(evaldRoot);
                            new(tree.processExtendsVisitor)()
                                .run(evaldRoot);
                            var css = evaldRoot.toCSS({
                                    compress: Boolean(options.compress),
                                    dumpLineNumbers: env.dumpLineNumbers,
                                    strictUnits: Boolean(options.strictUnits)});
                        } catch (e) {
                            throw new(LessError)(e, env);
                        }

                        if (options.yuicompress) {
                            return require('ycssmin').cssmin(css, options.maxLineLen);
                        } else {
                            return css;
                        }
                    };
                })(root.eval);

                if (i < input.length - 1) {
                    i = furthest;
                    lines = input.split('\n');
                    line = (input.slice(0, i).match(/\n/g) || "").length + 1;
                    for (var n = i, column = -1; n >= 0 && input.charAt(n) !== '\n'; n--) { column++ }
                    error = {
                        type: "Parse",
                        message: "Unrecognised input",
                        index: i,
                        filename: env.currentFileInfo.filename,
                        line: line,
                        column: column,
                        extract: [
                            lines[line - 2],
                            lines[line - 1],
                            lines[line]
                        ]
                    };
                }
                var finish = function (e) {
                    e = error || e || parser.imports.error;
                    if (e) {
                        if (!(e instanceof LessError)) {
                            e = new(LessError)(e, env);
                        }

                        callback(e);
                    }
                    else {
                        callback(null, root);
                    }
                };

                if (env.processImports !== false) {
                    new tree.importVisitor(this.imports, finish)
                        .run(root);
                } else {
                    finish();
                }
            },
            parsers: {
                primary: function () {
                    var node, root = [];

                    while ((node = $(this.extendRule) || $(this.mixin.definition) || $(this.rule)    ||  $(this.ruleset) ||
                                   $(this.mixin.call)       || $(this.comment) ||  $(this.directive))
                                   || $(/^[\s\n]+/) || $(/^;+/)) {
                        node && root.push(node);
                    }
                    return root;
                },
                comment: function () {
                    var comment;
                    if (input.charAt(i) !== '/') return;
                    if (input.charAt(i + 1) === '/') {
                        return new(tree.Comment)($(/^\/\/.*/), true);
                    } else if (comment = $(/^\/\*(?:[^*]|\*+[^\/*])*\*+\/\n?/)) {
                        return new(tree.Comment)(comment);
                    }
                },
                entities: {
                    quoted: function () {
                        var str, j = i, e, index = i;
                        if (input.charAt(j) === '~') { j++, e = true } // Escaped strings
                        if (input.charAt(j) !== '"' && input.charAt(j) !== "'") return;
                        e && $('~');
                        if (str = $(/^"((?:[^"\\\r\n]|\\.)*)"|'((?:[^'\\\r\n]|\\.)*)'/)) {
                            return new(tree.Quoted)(str[0], str[1] || str[2], e, index, env.currentFileInfo);
                        }
                    },
                    keyword: function () {
                        var k;

                        if (k = $(/^[_A-Za-z-][_A-Za-z0-9-]*/)) {
                            if (tree.Color.hasOwnProperty(k)) {
                                return new(tree.Color)(tree.colors[k].slice(1));
                            } else {
                                return new(tree.Keyword)(k);
                            }
                        }
                    },
                    call: function () {
                        var name, nameLC, args, alpha_ret, index = i;
                        if (! (name = /^([\w-]+|%|progid:[\w\.]+)\(/.exec(chunks[j]))) return;
                        name = name[1];
                        nameLC = name.toLowerCase();
                        if (nameLC === 'url') { return null }
                        else                  { i += name.length }
                        if (nameLC === 'alpha') {
                            alpha_ret = $(this.alpha);
                            if(typeof alpha_ret !== 'undefined') {
                                return alpha_ret;
                            }
                        }
                        $('(');
                        args = $(this.entities.arguments);
                        if (! $(')')) {
                            return;
                        }
                        if (name) { return new(tree.Call)(name, args, index, env.currentFileInfo); }
                    },
                    arguments: function () {
                        var args = [], arg;
                        while (arg = $(this.entities.assignment) || $(this.expression)) {
                            args.push(arg);
                            if (! $(',')) { break }
                        }
                        return args;
                    },
                    literal: function () {
                        return $(this.entities.dimension) ||
                               $(this.entities.color) ||
                               $(this.entities.quoted) ||
                               $(this.entities.unicodeDescriptor);
                    },
                    assignment: function () {
                        var key, value;
                        if ((key = $(/^\w+(?=\s?=)/i)) && $('=') && (value = $(this.entity))) {
                            return new(tree.Assignment)(key, value);
                        }
                    },
                    url: function () {
                        var value;
                        if (input.charAt(i) !== 'u' || !$(/^url\(/)) return;
                        value = $(this.entities.quoted)  || $(this.entities.variable) ||
                                $(/^(?:(?:\\[\(\)'"])|[^\(\)'"])+/) || "";
                        expect(')');
                        return new(tree.URL)((value.value != null || value instanceof tree.Variable)
                                            ? value : new(tree.Anonymous)(value), env.currentFileInfo);
                    },
                    variable: function () {
                        var name, index = i;
                        if (input.charAt(i) === '@' && (name = $(/^@@?[\w-]+/))) {
                            return new(tree.Variable)(name, index, env.currentFileInfo);
                        }
                    },
                    variableCurly: function () {
                        var name, curly, index = i;

                        if (input.charAt(i) === '@' && (curly = $(/^@\{([\w-]+)\}/))) {
                            return new(tree.Variable)("@" + curly[1], index, env.currentFileInfo);
                        }
                    },
                    color: function () {
                        var rgb;
                        if (input.charAt(i) === '#' && (rgb = $(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})/))) {
                            return new(tree.Color)(rgb[1]);
                        }
                    },
                    dimension: function () {
                        var value, c = input.charCodeAt(i);
                        if ((c > 57 || c < 43) || c === 47 || c == 44) return;

                        if (value = $(/^([+-]?\d*\.?\d+)(%|[a-z]+)?/)) {
                            return new(tree.Dimension)(value[1], value[2]);
                        }
                    },
                    unicodeDescriptor: function () {
                        var ud;

                        if (ud = $(/^U\+[0-9a-fA-F?]+(\-[0-9a-fA-F?]+)?/)) {
                            return new(tree.UnicodeDescriptor)(ud[0]);
                        }
                    },
                    javascript: function () {
                        var str, j = i, e;
                        if (input.charAt(j) === '~') { j++, e = true } // Escaped strings
                        if (input.charAt(j) !== '`') { return }
                        e && $('~');
                        if (str = $(/^`([^`]*)`/)) {
                            return new(tree.JavaScript)(str[1], i, e);
                        }
                    }
                },
                variable: function () {
                    var name;
                    if (input.charAt(i) === '@' && (name = $(/^(@[\w-]+)\s*:/))) { return name[1] }
                },
                extend: function(isRule) {
                    var elements, e, index = i, option, extendList = [];
                    if (!$(isRule ? /^&:extend\(/ : /^:extend\(/)) { return; }
                    do {
                        option = null;
                        elements = [];
                        while (true) {
                            option = $(/^(all)(?=\s*(\)|,))/);
                            if (option) { break; }
                            e = $(this.element);
                            if (!e) { break; }
                            elements.push(e);
                        }
                        option = option && option[1];
                        extendList.push(new(tree.Extend)(new(tree.Selector)(elements), option, index));
                    } while($(","))
                    expect(/^\)/);
                    if (isRule) {
                        expect(/^;/);
                    }
                    return extendList;
                },
                extendRule: function() {
                    return this.extend(true);
                },
                mixin: {
                    call: function () {
                        var elements = [], e, c, args, delim, arg, index = i, s = input.charAt(i), important = false;
                        if (s !== '.' && s !== '#') { return }
                        save();
                        while (e = $(/^[#.](?:[\w-]|\\(?:[A-Fa-f0-9]{1,6} ?|[^A-Fa-f0-9]))+/)) {
                            elements.push(new(tree.Element)(c, e, i));
                            c = $('>');
                        }
                        if ($('(')) {
                            args = this.mixin.args.call(this, true).args;
                            expect(')');
                        }
                        args = args || [];
                        if ($(this.important)) {
                            important = true;
                        }
                        if (elements.length > 0 && ($(';') || peek('}'))) {
                            return new(tree.mixin.Call)(elements, args, index, env.currentFileInfo, important);
                        }
                        restore();
                    },
                    args: function (isCall) {
                        var expressions = [], argsSemiColon = [], isSemiColonSeperated, argsComma = [], expressionContainsNamed, name, nameLoop, value, arg,
                            returner = {args:null, variadic: false};
                        while (true) {
                            if (isCall) {
                                arg = $(this.expression);
                            } else {
                                $(this.comment);
                                if (input.charAt(i) === '.' && $(/^\.{3}/)) {
                                    returner.variadic = true;
                                    if ($(";") && !isSemiColonSeperated) {
                                        isSemiColonSeperated = true;
                                    }
                                    (isSemiColonSeperated ? argsSemiColon : argsComma)
                                        .push({ variadic: true });
                                    break;
                                }
                                arg = $(this.entities.variable) || $(this.entities.literal)
                                    || $(this.entities.keyword);
                            }
                            if (!arg) {
                                break;
                            }
                            nameLoop = null;
                            if (arg.throwAwayComments) {
                                arg.throwAwayComments();
                            }
                            value = arg;
                            var val = null;
                            if (isCall) {
                                if (arg.value.length == 1) {
                                    var val = arg.value[0];
                                }
                            } else {
                                val = arg;
                            }
                            if (val && val instanceof tree.Variable) {
                                if ($(':')) {
                                    if (expressions.length > 0) {
                                        if (isSemiColonSeperated) {
                                            error("Cannot mix ; and , as delimiter types");
                                        }
                                        expressionContainsNamed = true;
                                    }
                                    value = expect(this.expression);
                                    nameLoop = (name = val.name);
                                } else if (!isCall && $(/^\.{3}/)) {
                                    returner.variadic = true;
                                    if ($(";") && !isSemiColonSeperated) {
                                        isSemiColonSeperated = true;
                                    }
                                    (isSemiColonSeperated ? argsSemiColon : argsComma)
                                        .push({ name: arg.name, variadic: true });
                                    break;
                                } else if (!isCall) {
                                    name = nameLoop = val.name;
                                    value = null;
                                }
                            }
                            if (value) {
                                expressions.push(value);
                            }
                            argsComma.push({ name:nameLoop, value:value });
                            if ($(',')) {
                                continue;
                            }
                            if ($(';') || isSemiColonSeperated) {
                                if (expressionContainsNamed) {
                                    error("Cannot mix ; and , as delimiter types");
                                }
                                isSemiColonSeperated = true;
                                if (expressions.length > 1) {
                                    value = new (tree.Value)(expressions);
                                }
                                argsSemiColon.push({ name:name, value:value });
                                name = null;
                                expressions = [];
                                expressionContainsNamed = false;
                            }
                        }

                        returner.args = isSemiColonSeperated ? argsSemiColon : argsComma;
                        return returner;
                    },
                    definition: function () {
                        var name, params = [], match, ruleset, param, value, cond, variadic = false;
                        if ((input.charAt(i) !== '.' && input.charAt(i) !== '#') ||
                            peek(/^[^{]*\}/)) return;
                        save();
                        if (match = $(/^([#.](?:[\w-]|\\(?:[A-Fa-f0-9]{1,6} ?|[^A-Fa-f0-9]))+)\s*\(/)) {
                            name = match[1];
                            var argInfo = this.mixin.args.call(this, false);
                            params = argInfo.args;
                            variadic = argInfo.variadic;
                            if (!$(')')) {
                                furthest = i;
                                restore();
                            }
                            $(this.comment);
                            if ($(/^when/)) { // Guard
                                cond = expect(this.conditions, 'expected condition');
                            }
                            ruleset = $(this.block);
                            if (ruleset) {
                                return new(tree.mixin.Definition)(name, params, ruleset, cond, variadic);
                            } else {
                                restore();
                            }
                        }
                    }
                },
                entity: function () {
                    return $(this.entities.literal) || $(this.entities.variable) || $(this.entities.url) ||
                           $(this.entities.call)    || $(this.entities.keyword)  ||$(this.entities.javascript) ||
                           $(this.comment);
                },
                end: function () {
                    return $(';') || peek('}');
                },
                alpha: function () {
                    var value;
                    if (! $(/^\(opacity=/i)) return;
                    if (value = $(/^\d+/) || $(this.entities.variable)) {
                        expect(')');
                        return new(tree.Alpha)(value);
                    }
                },
                element: function () {
                    var e, t, c, v;
                    c = $(this.combinator);
                    e = $(/^(?:\d+\.\d+|\d+)%/) || $(/^(?:[.#]?|:*)(?:[\w-]|[^\x00-\x9f]|\\(?:[A-Fa-f0-9]{1,6} ?|[^A-Fa-f0-9]))+/) ||
                        $('*') || $('&') || $(this.attribute) || $(/^\([^()@]+\)/) || $(/^[\.#](?=@)/) || $(this.entities.variableCurly);
                    if (! e) {
                        if ($('(')) {
                            if ((v = ($(this.selector))) &&
                                    $(')')) {
                                e = new(tree.Paren)(v);
                            }
                        }
                    }
                    if (e) { return new(tree.Element)(c, e, i) }
                },
                combinator: function () {
                    var c = input.charAt(i);

                    if (c === '>' || c === '+' || c === '~' || c === '|') {
                        i++;
                        while (input.charAt(i).match(/\s/)) { i++ }
                        return new(tree.Combinator)(c);
                    } else if (input.charAt(i - 1).match(/\s/)) {
                        return new(tree.Combinator)(" ");
                    } else {
                        return new(tree.Combinator)(null);
                    }
                },
                selector: function () {
                    var sel, e, elements = [], c, extend, extendList = [];
                    while ((extend = $(this.extend)) || (e = $(this.element))) {
                        if (extend) {
                            extendList.push.apply(extendList, extend);
                        } else {
                            if (extendList.length) {
                                error("Extend can only be used at the end of selector");
                            }
                            c = input.charAt(i);
                            elements.push(e)
                            e = null;
                        }
                        if (c === '{' || c === '}' || c === ';' || c === ',' || c === ')') { break }
                    }
                    if (elements.length > 0) { return new(tree.Selector)(elements, extendList); }
                    if (extendList.length) { error("Extend must be used to extend a selector, it cannot be used on its own"); }
                },
                attribute: function () {
                    var attr = '', key, val, op;
                    if (! $('[')) return;
                    if (!(key = $(this.entities.variableCurly))) {
                        key = expect(/^(?:[_A-Za-z0-9-\*]*\|)?(?:[_A-Za-z0-9-]|\\.)+/);
                    }
                    if ((op = $(/^[|~*$^]?=/))) {
                        val = $(this.entities.quoted) || $(/^[\w-]+/) || $(this.entities.variableCurly);
                    }
                    expect(']');
                    return new(tree.Attribute)(key, op, val);
                },
                block: function () {
                    var content;
                    if ($('{') && (content = $(this.primary)) && $('}')) {
                        return content;
                    }
                },
                ruleset: function () {
                    var selectors = [], s, rules, debugInfo;
                    save();
                    if (env.dumpLineNumbers)
                        debugInfo = getDebugInfo(i, input, env);
                    while (s = $(this.selector)) {
                        selectors.push(s);
                        $(this.comment);
                        if (! $(',')) { break }
                        $(this.comment);
                    }
                    if (selectors.length > 0 && (rules = $(this.block))) {
                        var ruleset = new(tree.Ruleset)(selectors, rules, env.strictImports);
                        if (env.dumpLineNumbers)
                            ruleset.debugInfo = debugInfo;
                        return ruleset;
                    } else {
                        furthest = i;
                        restore();
                    }
                },
                rule: function (tryAnonymous) {
                    var name, value, c = input.charAt(i), important;
                    save();
                    if (c === '.' || c === '#' || c === '&') { return }
                    if (name = $(this.variable) || $(this.property)) {
                        value = !tryAnonymous && (env.compress || (name.charAt(0) === '@')) ?
                            ($(this.value) || $(this.anonymousValue)) :
                            ($(this.anonymousValue) || $(this.value));
                        important = $(this.important);
                        if (value && $(this.end)) {
                            return new(tree.Rule)(name, value, important, memo, env.currentFileInfo);
                        } else {
                            furthest = i;
                            restore();
                            if (value && !tryAnonymous) {
                                return this.rule(true);
                            }
                        }
                    }
                },
                anonymousValue: function () {
                    var match;
                    if (match = /^([^@+\/'"*`(;{}-]*);/.exec(chunks[j])) {
                        i += match[0].length - 1;
                        return new(tree.Anonymous)(match[1]);
                    }
                },
                "import": function () {
                    var path, features, index = i;
                    save();
                    var dir = $(/^@import?\s+/);
                    var options = (dir ? $(this.importOptions) : null) || {};
                    if (dir && (path = $(this.entities.quoted) || $(this.entities.url))) {
                        features = $(this.mediaFeatures);
                        if ($(';')) {
                            features = features && new(tree.Value)(features);
                            return new(tree.Import)(path, features, options, index, env.currentFileInfo);
                        }
                    }
                    restore();
                },
                importOptions: function() {
                    var o, options = {}, optionName, value;
                    if (! $('(')) { return null; }
                    do {
                        if (o = $(this.importOption)) {
                            optionName = o;
                            value = true;
                            switch(optionName) {
                                case "css":
                                    optionName = "less";
                                    value = false;
                                break;
                                case "once":
                                    optionName = "multiple";
                                    value = false;
                                break;
                            }
                            options[optionName] = value;
                            if (! $(',')) { break }
                        }
                    } while (o);
                    expect(')');
                    return options;
                },
                importOption: function() {
                    var opt = $(/^(less|css|multiple|once)/);
                    if (opt) {
                        return opt[1];
                    }
                },
                mediaFeature: function () {
                    var e, p, nodes = [];

                    do {
                        if (e = $(this.entities.keyword)) {
                            nodes.push(e);
                        } else if ($('(')) {
                            p = $(this.property);
                            e = $(this.value);
                            if ($(')')) {
                                if (p && e) {
                                    nodes.push(new(tree.Paren)(new(tree.Rule)(p, e, null, i, env.currentFileInfo, true)));
                                } else if (e) {
                                    nodes.push(new(tree.Paren)(e));
                                } else {
                                    return null;
                                }
                            } else { return null }
                        }
                    } while (e);
                    if (nodes.length > 0) {
                        return new(tree.Expression)(nodes);
                    }
                },
                mediaFeatures: function () {
                    var e, features = [];

                    do {
                      if (e = $(this.mediaFeature)) {
                          features.push(e);
                          if (! $(',')) { break }
                      } else if (e = $(this.entities.variable)) {
                          features.push(e);
                          if (! $(',')) { break }
                      }
                    } while (e);

                    return features.length > 0 ? features : null;
                },
                media: function () {
                    var features, rules, media, debugInfo;
                    if (env.dumpLineNumbers)
                        debugInfo = getDebugInfo(i, input, env);
                    if ($(/^@media/)) {
                        features = $(this.mediaFeatures);

                        if (rules = $(this.block)) {
                            media = new(tree.Media)(rules, features);
                            if(env.dumpLineNumbers)
                                media.debugInfo = debugInfo;
                            return media;
                        }
                    }
                },
                directive: function () {
                    var name, value, rules, identifier, e, nodes, nonVendorSpecificName,
                        hasBlock, hasIdentifier, hasExpression;

                    if (input.charAt(i) !== '@') return;

                    if (value = $(this['import']) || $(this.media)) {
                        return value;
                    }

                    save();

                    name = $(/^@[a-z-]+/);

                    if (!name) return;

                    nonVendorSpecificName = name;
                    if (name.charAt(1) == '-' && name.indexOf('-', 2) > 0) {
                        nonVendorSpecificName = "@" + name.slice(name.indexOf('-', 2) + 1);
                    }

                    switch(nonVendorSpecificName) {
                        case "@font-face":
                            hasBlock = true;
                            break;
                        case "@viewport":
                        case "@top-left":
                        case "@top-left-corner":
                        case "@top-center":
                        case "@top-right":
                        case "@top-right-corner":
                        case "@bottom-left":
                        case "@bottom-left-corner":
                        case "@bottom-center":
                        case "@bottom-right":
                        case "@bottom-right-corner":
                        case "@left-top":
                        case "@left-middle":
                        case "@left-bottom":
                        case "@right-top":
                        case "@right-middle":
                        case "@right-bottom":
                            hasBlock = true;
                            break;
                        case "@page":
                        case "@document":
                        case "@supports":
                        case "@keyframes":
                            hasBlock = true;
                            hasIdentifier = true;
                            break;
                        case "@namespace":
                            hasExpression = true;
                            break;
                    }
                    if (hasIdentifier) {
                        name += " " + ($(/^[^{]+/) || '').trim();
                    }
                    if (hasBlock)
                    {
                        if (rules = $(this.block)) {
                            return new(tree.Directive)(name, rules);
                        }
                    } else {
                        if ((value = hasExpression ? $(this.expression) : $(this.entity)) && $(';')) {
                            var directive = new(tree.Directive)(name, value);
                            if (env.dumpLineNumbers) {
                                directive.debugInfo = getDebugInfo(i, input, env);
                            }
                            return directive;
                        }
                    }

                    restore();
                },
                value: function () {
                    var e, expressions = [], important;

                    while (e = $(this.expression)) {
                        expressions.push(e);
                        if (! $(',')) { break }
                    }

                    if (expressions.length > 0) {
                        return new(tree.Value)(expressions);
                    }
                },
                important: function () {
                    if (input.charAt(i) === '!') {
                        return $(/^! *important/);
                    }
                },
                sub: function () {
                    var a, e;
                    if ($('(')) {
                        if (a = $(this.addition)) {
                            e = new(tree.Expression)([a]);
                            expect(')');
                            e.parens = true;
                            return e;
                        }
                    }
                },
                multiplication: function () {
                    var m, a, op, operation, isSpaced, expression = [];
                    if (m = $(this.operand)) {
                        isSpaced = isWhitespace(input.charAt(i - 1));
                        while (!peek(/^\/[*\/]/) && (op = ($('/') || $('*')))) {
                            if (a = $(this.operand)) {
                                m.parensInOp = true;
                                a.parensInOp = true;
                                operation = new(tree.Operation)(op, [operation || m, a], isSpaced);
                                isSpaced = isWhitespace(input.charAt(i - 1));
                            } else {
                                break;
                            }
                        }
                        return operation || m;
                    }
                },
                addition: function () {
                    var m, a, op, operation, isSpaced;
                    if (m = $(this.multiplication)) {
                        isSpaced = isWhitespace(input.charAt(i - 1));
                        while ((op = $(/^[-+]\s+/) || (!isSpaced && ($('+') || $('-')))) &&
                               (a = $(this.multiplication))) {
                            m.parensInOp = true;
                            a.parensInOp = true;
                            operation = new(tree.Operation)(op, [operation || m, a], isSpaced);
                            isSpaced = isWhitespace(input.charAt(i - 1));
                        }
                        return operation || m;
                    }
                },
                conditions: function () {
                    var a, b, index = i, condition;
                    if (a = $(this.condition)) {
                        while ($(',') && (b = $(this.condition))) {
                            condition = new(tree.Condition)('or', condition || a, b, index);
                        }
                        return condition || a;
                    }
                },
                condition: function () {
                    var a, b, c, op, index = i, negate = false;
                    if ($(/^not/)) { negate = true }
                    expect('(');
                    if (a = $(this.addition) || $(this.entities.keyword) || $(this.entities.quoted)) {
                        if (op = $(/^(?:>=|=<|[<=>])/)) {
                            if (b = $(this.addition) || $(this.entities.keyword) || $(this.entities.quoted)) {
                                c = new(tree.Condition)(op, a, b, index, negate);
                            } else {
                                error('expected expression');
                            }
                        } else {
                            c = new(tree.Condition)('=', a, new(tree.Keyword)('true'), index, negate);
                        }
                        expect(')');
                        return $(/^and/) ? new(tree.Condition)('and', c, $(this.condition)) : c;
                    }
                },
                operand: function () {
                    var negate, p = input.charAt(i + 1);

                    if (input.charAt(i) === '-' && (p === '@' || p === '(')) { negate = $('-') }
                    var o = $(this.sub) || $(this.entities.dimension) ||
                            $(this.entities.color) || $(this.entities.variable) ||
                            $(this.entities.call);

                    if (negate) {
                        o.parensInOp = true;
                        o = new(tree.Negative)(o);
                    }
                    return o;
                },
                expression: function () {
                    var e, delim, entities = [], d;

                    while (e = $(this.addition) || $(this.entity)) {
                        entities.push(e);
                        if (!peek(/^\/[\/*]/) && (delim = $('/'))) {
                            entities.push(new(tree.Anonymous)(delim));
                        }
                    }
                    if (entities.length > 0) {
                        return new(tree.Expression)(entities);
                    }
                },
                property: function () {
                    var name;
                    if (name = $(/^(\*?-?[_a-zA-Z0-9-]+)\s*:/)) {
                        return name[1];
                    }
                }
            }
        };
    };

    module.exports = Parser;
})(module);

