/**
 * TUI Adapter Interface
 *
 * Library-agnostic terminal UI interface.
 * Implementations can use Ink, Blessed, React-Blessed, or any other TUI library.
 *
 * This separation allows:
 * - Multiple adapter implementations without coupling
 * - Easy testing with mock adapters
 * - Library migration without changing consumer code
 */

import type React from 'react';

import { createDefaultTUIAdapter } from './tui-adapter';

/**
 * Box component props - layout container
 */
export interface BoxProps {
	borderColor?: string;
	borderStyle?: 'bold' | 'classic' | 'double' | 'doubleSingle' | 'round' | 'single' | 'singleDouble';
	children?: React.ReactNode;
	flexDirection?: 'column' | 'column-reverse' | 'row' | 'row-reverse';
	flexGrow?: number;
	height?: number | string;
	marginBottom?: number;
	marginLeft?: number;
	marginRight?: number;
	marginTop?: number;
	marginX?: number;
	marginY?: number;
	padding?: number;
	paddingBottom?: number;
	paddingLeft?: number;
	paddingRight?: number;
	paddingTop?: number;
	paddingX?: number;
	paddingY?: number;
	width?: number | string;
}

/**
 * Text component props - styled text
 */
export interface TextProps {
	backgroundColor?: string;
	bold?: boolean;
	children?: React.ReactNode;
	color?: string;
	dimColor?: boolean;
	italic?: boolean;
	strikethrough?: boolean;
	underline?: boolean;
}

/**
 * Newline component props
 */
export interface NewlineProps {
	count?: number;
}

/**
 * Key input from useInput hook
 */
export interface Key {
	backspace?: boolean;
	ctrl?: boolean;
	delete?: boolean;
	downArrow?: boolean;
	escape?: boolean;
	leftArrow?: boolean;
	meta?: boolean;
	pageDown?: boolean;
	pageUp?: boolean;
	return?: boolean;
	rightArrow?: boolean;
	shift?: boolean;
	tab?: boolean;
	upArrow?: boolean;
}

/**
 * Input handler function type
 */
export type InputHandler = (input: string, key: Key) => void;

/**
 * App control interface from useApp hook
 */
export interface AppControl {
	exit(error?: Error): void;
}

/**
 * Render result interface
 */
export interface RenderResult {
	clear(): void;
	rerender(tree: React.ReactElement): void;
	unmount(): void;
	waitUntilExit(): Promise<void>;
}

/**
 * TUI Component Adapter
 *
 * Provides access to TUI components as React components
 */
export interface TUIComponentAdapter {
	/**
	 * Box component for layout
	 */
	Box: React.FC<BoxProps>;

	/**
	 * Text component for styled text
	 */
	Text: React.FC<TextProps>;

	/**
	 * Newline component
	 */
	Newline: React.FC<NewlineProps>;
}

/**
 * TUI Hook Adapter
 *
 * Provides access to TUI hooks
 */
export interface TUIHookAdapter {
	/**
	 * Hook for handling keyboard input
	 *
	 * @param handler - Function to handle input
	 * @param options - Optional configuration
	 */
	useInput(handler: InputHandler, options?: { isActive?: boolean }): void;

	/**
	 * Hook for controlling the app
	 *
	 * @returns App control object
	 */
	useApp(): AppControl;
}

/**
 * TUI Render Adapter
 *
 * Provides the render function
 */
export interface TUIRenderAdapter {
	/**
	 * Render a React element to the terminal
	 *
	 * @param element - React element to render
	 * @returns Render result with control functions
	 */
	render(element: React.ReactElement): RenderResult;
}

/**
 * Complete TUI Adapter Interface
 *
 * Combines components, hooks, and render functionality
 */
export interface TUIAdapter extends TUIComponentAdapter, TUIHookAdapter, TUIRenderAdapter {}

/**
 * Singleton instance
 */
let adapterInstance: null | TUIAdapter = null;

/**
 * Get the singleton TUIAdapter instance
 *
 * @returns TUIAdapter instance
 *
 * @example
 * import { getTUIAdapter } from 'ui/tui-adapter.interface';
 *
 * const tui = getTUIAdapter();
 * const { Box, Text } = tui;
 *
 * function MyComponent() {
 *   tui.useInput((input) => {
 *     if (input === 'q') process.exit(0);
 *   });
 *
 *   return (
 *     <Box>
 *       <Text color="cyan">Hello World</Text>
 *     </Box>
 *   );
 * }
 *
 * tui.render(<MyComponent />);
 */
export function getTUIAdapter(): TUIAdapter {
	adapterInstance ??= createDefaultTUIAdapter();
	return adapterInstance!;
}

/**
 * Set a custom TUIAdapter implementation
 * Useful for testing or switching to different TUI libraries
 *
 * @param adapter - The adapter instance to use
 *
 * @example
 * // In tests
 * import { setTUIAdapter } from 'ui/tui-adapter.interface';
 *
 * const mockAdapter = new MockTUIAdapter();
 * setTUIAdapter(mockAdapter);
 */
export function setTUIAdapter(adapter: TUIAdapter): void {
	adapterInstance = adapter;
}
