/**
 * Ink TUI Adapter - Ink implementation of the TUI adapter
 *
 * This is a concrete implementation of TUIAdapter using the Ink library.
 * The interfaces are defined separately to allow for other implementations (blessed, react-blessed, etc.)
 *
 * Benefits:
 * - Implements library-agnostic TUIAdapter interface
 * - Can be swapped with other implementations without changing consumers
 * - Provides the familiar Ink API through the adapter
 */

import type React from 'react';

// eslint-disable-next-line import/no-unresolved -- ink is an optional peer dependency for TUI functionality
import { Box as InkBox, Newline as InkNewline, render as inkRender, Text as InkText, useApp, useInput } from 'ink';

import type {
	AppControl,
	BoxProps,
	InputHandler,
	NewlineProps,
	RenderResult,
	TextProps,
	TUIAdapter
} from './tui-adapter.interface';

/**
 * Ink Adapter Implementation
 *
 * Concrete implementation of TUIAdapter using the Ink library.
 */
export class InkAdapter implements TUIAdapter {
	/**
	 * Box component for layout
	 */
	Box: React.FC<BoxProps> = InkBox as React.FC<BoxProps>;

	/**
	 * Text component for styled text
	 */
	Text: React.FC<TextProps> = InkText as React.FC<TextProps>;

	/**
	 * Newline component
	 */
	Newline: React.FC<NewlineProps> = InkNewline as React.FC<NewlineProps>;

	/**
	 * Hook for handling keyboard input
	 */
	useInput(handler: InputHandler, options?: { isActive?: boolean }): void {
		return useInput(handler, options);
	}

	/**
	 * Hook for controlling the app
	 */
	useApp(): AppControl {
		return useApp();
	}

	/**
	 * Render a React element to the terminal
	 */
	render(element: React.ReactElement): RenderResult {
		return inkRender(element);
	}
}

/**
 * Default adapter instance factory
 * This is used by the getTUIAdapter function in the interface
 */
export function createDefaultTUIAdapter(): TUIAdapter {
	return new InkAdapter();
}
