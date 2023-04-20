<?php

namespace Creagia\FilamentCodeField;

use Creagia\FilamentCodeField\Concerns\Autocompletion;
use Creagia\FilamentCodeField\Concerns\ControlsHeight;
use Creagia\FilamentCodeField\Concerns\HasDisplayMode;
use Creagia\FilamentCodeField\Concerns\LineNumbers;
use Filament\Forms\Components\Field;

class CodeField extends Field
{
    use Autocompletion;
    use ControlsHeight;
    use HasDisplayMode;
    use LineNumbers;

    protected string $view = 'filament-code-field::code-field';
}
