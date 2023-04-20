<?php

namespace Creagia\FilamentCodeField\Concerns;

use Illuminate\Contracts\Support\Arrayable;

trait Autocompletion
{
    public bool $autocompletion = true;
    public array | Arrayable | string | \Closure $autocompletionList = [];

    public function disableAutocompletion(): static
    {
        $this->autocompletion = false;

        return $this;
    }

    public function getAutocompletionList() {
        $autocompletionList = $this->evaluate($this->autocompletionList) ?? [];

        if (is_string($autocompletionList) && function_exists('enum_exists') && enum_exists($autocompletionList)) {
            $autocompletionList = collect($autocompletionList::cases())->mapWithKeys(static fn ($case) => [($case?->value ?? $case->name) => $case->name]);
        }

        if ($autocompletionList instanceof Arrayable) {
            $autocompletionList = $autocompletionList->toArray();
        }

        return $autocompletionList;
    }

    public function addAutocompletionListItem(array $item) : static {
        if(!is_array($this->autocompletionList)) {
            $this->autocompletionList = [];
        }

        $this->autocompletionList[] = $item;
        return $this;
    }

    public function setAutocompletionListItems(array | Arrayable | string | \Closure $items) : static {
        $this->autocompletionList = $items;
        return $this;
    }
}
