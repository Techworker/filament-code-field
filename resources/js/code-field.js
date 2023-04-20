import { EditorView } from "codemirror"
import { lineNumbers } from '@codemirror/view';
import { Compartment } from '@codemirror/state';
import { autocompletion } from '@codemirror/autocomplete';
import darkTheme from './themes/dark'
import lightTheme from './themes/light'
import {StreamLanguage} from "@codemirror/language"
import {variable} from "./variable"

let theme = new Compartment

export default (Alpine) => {
    Alpine.data('filamentCodeField', ({
        state,
        displayMode,
        disabled,
        withLineNumbers,
        withAutocompletion,
        autocompletionList,
    }) => {
        return {
            state,
            codeMirror: null,
            init() {
                this.codeMirror = new EditorView({
                    doc: this.state,
                    extensions: this.buildExtensionsArray(),
                    parent: this.$refs.codeBlock,
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

                extensions.push(StreamLanguage.define(variable));

                return extensions;
            }
        }
    });
}
