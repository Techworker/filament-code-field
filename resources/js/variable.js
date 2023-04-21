var words = {};
function define(style, dict) {
    for(var i = 0; i < dict.length; i++) {
        words[dict[i]] = style;
    }
};

var commonAtoms = ["true", "false"];
var commonKeywords = ["@if", "@endif", "@foreach", "@endforeach", "@elseif"];
var commonCommands = [""];

define('atom', commonAtoms);
define('keyword', commonKeywords);
define('builtin', commonCommands);

function tokenBase(stream, state) {
    if (stream.eatSpace()) return null;

    var sol = stream.sol();
    var ch = stream.next();

    if (ch === '\\') {
        stream.next();
        return null;
    }
    if (ch === '$') {
        state.tokens.unshift(tokenDollar);
        return tokenize(stream, state);
    }
    if (ch === '{') {
        state.tokens.unshift(tokenVariable);
        return tokenize(stream, state);
    }
    stream.eatWhile(/[\w-]/);
    var cur = stream.current();
    if (stream.peek() === '=' && /\w+/.test(cur)) return 'def';
    return words.hasOwnProperty(cur) ? words[cur] : null;
}

function tokenString(quote, style) {
    var close = quote == "(" ? ")" : quote == "{" ? "}" : quote
    return function(stream, state) {
        var next, escaped = false;
        while ((next = stream.next()) != null) {
            if (next === close && !escaped) {
                state.tokens.shift();
                break;
            } else if (next === '$' && !escaped && quote !== "'" && stream.peek() != close) {
                escaped = true;
                stream.backUp(1);
                state.tokens.unshift(tokenDollar);
                break;
            } else if (!escaped && quote !== close && next === quote) {
                state.tokens.unshift(tokenString(quote, style))
                return tokenize(stream, state)
            } else if (!escaped && /['"]/.test(next) && !/['"]/.test(quote)) {
                state.tokens.unshift(tokenStringStart(next, "string"));
                stream.backUp(1);
                break;
            }
            escaped = !escaped && next === '\\';
        }
        return style;
    };
};

function tokenStringStart(quote, style) {
    return function(stream, state) {
        state.tokens[0] = tokenString(quote, style)
        stream.next()
        return tokenize(stream, state)
    }
}

var tokenDollar = function(stream, state) {
    if (state.tokens.length > 1) stream.eat('$');
    var ch = stream.next()
    if (/['"({]/.test(ch)) {
        state.tokens[0] = tokenString(ch, ch == "(" ? "quote" : ch == "{" ? "def" : "string");
        return tokenize(stream, state);
    }
    if (!/\d/.test(ch)) stream.eatWhile(/\w/);
    state.tokens.shift();
    return 'def';
};

var tokenVariable = function(stream, state) {
    if (state.tokens.length > 1) stream.eat('{');
    stream.next()
    let ch = stream.next()
    if(ch === '$') {
        stream.eatWhile(/[a-zA-Z0-9\-\>\_\[\]]/);
        stream.eatWhile(/[\}]/);
    }
    state.tokens.shift();
    return 'def';
};

function tokenHeredoc(delim) {
    return function(stream, state) {
        if (stream.sol() && stream.string == delim) state.tokens.shift()
        stream.skipToEnd()
        return "string.special"
    }
}

function tokenize(stream, state) {
    return (state.tokens[0] || tokenBase) (stream, state);
};

export const variable = {
    name: "variable",
    startState: function() {return {tokens:[]};},
    token: function(stream, state) {
        return tokenize(stream, state);
    },
    languageData: {
        autocomplete: commonAtoms.concat(commonKeywords, commonCommands),
        closeBrackets: {brackets: ["(", "[", "{", "'", '"', "`"]},
        commentTokens: {line: "#"}
    }
};
