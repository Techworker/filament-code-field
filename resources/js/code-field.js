import { EditorView } from "codemirror"
import { indentWithTab } from '@codemirror/commands';
import { keymap, lineNumbers } from '@codemirror/view';
import { Compartment } from '@codemirror/state';
import { php } from "@codemirror/lang-php"
import { javascript } from "@codemirror/lang-javascript"
import { json } from "@codemirror/lang-json"
import { html } from "@codemirror/lang-html"
import { css } from '@codemirror/lang-css';
import { xml } from "@codemirror/lang-xml"
import { sql } from "@codemirror/lang-sql"
import { autocompletion } from '@codemirror/autocomplete';
import darkTheme from './themes/dark'
import lightTheme from './themes/light'

let theme = new Compartment

export default (Alpine) => {
    Alpine.data('filamentCodeField', ({
        state,
        displayMode,
        language,
        disabled,
        withLineNumbers,
        withAutocompletion,
        autocompletionList,
    }) => {
        return {
            state,
            codeMirror: null,
            parsers: { php, javascript, json, html, css, xml, sql },
            init() {
                this.codeMirror = new EditorView({
                    doc: this.state,
                    extensions: this.buildExtensionsArray(),
                    parent: this.$refs.codeBlock
                })

                if (displayMode) {
                    this.$watch('state', newState => {
                        this.codeMirror.dispatch({
                            changes: {
                                from: 0,
                                to: this.codeMirror.state.doc.length,
                                insert: newState
                            }
                        });
                    })
                }

                window.addEventListener('dark-mode-toggled', (e) => {
                    this.codeMirror.dispatch({
                        effects: theme.reconfigure(
                            e.detail === 'dark'
                                ? darkTheme
                                : lightTheme
                        )
                    })
                });
            },
            buildExtensionsArray() {
                const darkModeElement = document.querySelector('[dark-mode]')
                const lightMode = darkModeElement
                        ? darkModeElement._x_dataStack[0].theme === 'light'
                        : true

                let extensions = [
                    this.parsers[language](),
                    keymap.of([indentWithTab]),
                    theme.of(lightMode ? lightTheme : darkTheme),
                    EditorView.contentAttributes.of({
                        contenteditable: !disabled && !displayMode
                    }),
                    EditorView.lineWrapping
                ];

                if (! displayMode) {
                    extensions.push(EditorView.updateListener.of((v) => {
                        if (v.docChanged) {
                            this.state = v.state.doc.toString()
                        }
                    }))
                }

                if (withAutocompletion) {
                    function filamentCompletions(context) {
                        let word = context.matchBefore(/\w*/)
                        if (word.from === word.to && !context.explicit)
                            return null
                        return {
                            from: word.from,
                            options: autocompletionList
                        }
                    }

                    extensions.push(autocompletion({override: [filamentCompletions]}));
                }

                if (withLineNumbers) {
                    extensions.push(lineNumbers());
                }

                return extensions;
            }
        }
    });
}
