<?php

namespace Creagia\FilamentCodeField\Concerns;

trait Autocompletion
{
    public bool $autocompletion = true;
    public array $autocompleteList = [];

    public function disableAutocompletion(): static
    {
        $this->autocompletion = false;

        return $this;
    }

    public function addAutocompleteListItem(array $item) : static {
        $this->autocompleteList[] = $item;
        return $this;
    }

    public function setAutocompleteListItems(array $items) : static {
        $this->autocompleteList = $items;
        return $this;
    }
}
