<?php

namespace Creagia\FilamentCodeField\Concerns;

trait Autocompletion
{
    public bool $autocompletion = true;
    public array $autocompletionList = [];

    public function disableAutocompletion(): static
    {
        $this->autocompletion = false;

        return $this;
    }

    public function addAutocompletionListItem(array $item) : static {
        $this->autocompletionList[] = $item;
        return $this;
    }

    public function setAutocompletionListItems(array $items) : static {
        $this->autocompletionList = $items;
        return $this;
    }
}
