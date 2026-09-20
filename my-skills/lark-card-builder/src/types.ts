export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type TextKind = "plainText" | "larkMd";
export type TextAlign = "left" | "center" | "right";
export type Direction = "vertical" | "horizontal";
export type HorizontalAlign = "left" | "center" | "right";
export type VerticalAlign = "top" | "center" | "bottom";

export interface TextSpec {
  kind: TextKind;
  content: string;
  textSize?: string;
  textColor?: string;
  textAlign?: TextAlign;
  lines?: number;
}

export interface StandardIconSpec {
  kind: "standardIcon";
  token: string;
  color?: string;
  size?: string;
}

export interface CustomIconSpec {
  kind: "customIcon";
  imageKey: string;
}

export type IconSpec = StandardIconSpec | CustomIconSpec;

export interface CallbackBehaviorSpec {
  kind: "callback";
  value: JsonObject;
}

export interface OpenUrlBehaviorSpec {
  kind: "openUrl";
  defaultUrl: string;
  pcUrl?: string;
  iosUrl?: string;
  androidUrl?: string;
}

export type BehaviorSpec = CallbackBehaviorSpec | OpenUrlBehaviorSpec;

export interface ConfirmSpec {
  title: string;
  text?: string;
}

export interface BaseComponentSpec {
  key?: string;
  streamTarget?: boolean;
  margin?: string;
}

export type MarkdownFragmentSpec =
  | { kind: "text"; text: string }
  | { kind: "boldText"; text: string }
  | { kind: "lineBreak" }
  | { kind: "link"; label: string; url: string }
  | { kind: "rawMarkdown"; markdown: string };

export interface MarkdownSpec extends BaseComponentSpec {
  kind: "markdown";
  content?: string;
  fragments?: MarkdownFragmentSpec[];
  textSize?: string;
  textAlign?: TextAlign;
  color?: string;
  icon?: IconSpec;
}

export interface DivFieldSpec {
  short?: boolean;
  text: TextSpec;
}

export interface DivSpec extends BaseComponentSpec {
  kind: "div";
  text?: TextSpec;
  fields?: DivFieldSpec[];
  icon?: IconSpec;
  width?: string;
}

export interface HrSpec extends BaseComponentSpec {
  kind: "hr";
}

export interface ImageSpec extends BaseComponentSpec {
  kind: "image";
  imageKey: string;
  alt: string;
  title?: string;
  scaleType?: "cropCenter" | "cropTop" | "fitHorizontal";
  size?: string;
  cornerRadius?: string;
  transparent?: boolean;
  preview?: boolean;
}

export interface ButtonSpec extends BaseComponentSpec {
  kind: "button";
  text: string;
  appearance?:
    | "default"
    | "primary"
    | "danger"
    | "text"
    | "primaryText"
    | "dangerText"
    | "primaryFilled"
    | "dangerFilled"
    | "laser";
  size?: "tiny" | "small" | "medium" | "large";
  width?: string;
  behaviors?: BehaviorSpec[];
  icon?: IconSpec;
  hoverTips?: string;
  disabled?: boolean;
  disabledTips?: string;
  confirm?: ConfirmSpec;
  name?: string;
  formAction?: "submit" | "reset";
}

export interface InputSpec extends BaseComponentSpec {
  kind: "input";
  name?: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
  label?: string;
  labelPosition?: "top" | "left";
  inputType?: "text" | "multilineText" | "password";
  rows?: number;
  autoResize?: boolean;
  maxRows?: number;
  maxLength?: number;
  showIcon?: boolean;
  width?: string;
  disabled?: boolean;
  disabledTips?: string;
  behaviors?: BehaviorSpec[];
  confirm?: ConfirmSpec;
}

export interface SelectOptionSpec {
  text: string;
  value: string;
  icon?: IconSpec;
}

export interface StaticSelectSpec extends BaseComponentSpec {
  kind: "staticSelect";
  options: SelectOptionSpec[];
  name?: string;
  required?: boolean;
  appearance?: "default" | "text";
  placeholder?: string;
  initialOption?: string;
  initialIndex?: number;
  width?: string;
  disabled?: boolean;
  disabledTips?: string;
  behaviors?: BehaviorSpec[];
  confirm?: ConfirmSpec;
}

export interface FormSpec extends BaseComponentSpec {
  kind: "form";
  name: string;
  components: ComponentSpec[];
  direction?: Direction;
  horizontalSpacing?: string;
  verticalSpacing?: string;
  horizontalAlign?: HorizontalAlign;
  verticalAlign?: VerticalAlign;
  padding?: string;
}

export type TableDataType =
  | "text"
  | "larkMd"
  | "number"
  | "options"
  | "persons"
  | "date"
  | "markdown";

export interface TableColumnSpec {
  name: string;
  displayName?: string;
  dataType: TableDataType;
  width?: string;
  horizontalAlign?: HorizontalAlign;
  verticalAlign?: VerticalAlign;
  dateFormat?: string;
  numberFormat?: {
    precision?: number;
    symbol?: string;
    separator?: boolean;
  };
}

export interface TableHeaderStyleSpec {
  textAlign?: TextAlign;
  textSize?: string;
  backgroundStyle?: "grey" | "none";
  textColor?: string;
  bold?: boolean;
  lines?: number;
}

export interface TableSpec extends BaseComponentSpec {
  kind: "table";
  columns: TableColumnSpec[];
  rows: JsonObject[];
  pageSize?: number;
  rowHeight?: string;
  rowMaxHeight?: string;
  freezeFirstColumn?: boolean;
  headerStyle?: TableHeaderStyleSpec;
}

export interface ColumnSpec extends BaseComponentSpec {
  kind: "column";
  components: ComponentSpec[];
  width?: string;
  weight?: number;
  verticalAlign?: VerticalAlign;
  direction?: Direction;
  horizontalSpacing?: string;
  verticalSpacing?: string;
  padding?: string;
  backgroundStyle?: string;
  cornerRadius?: string;
  openUrl?: string;
}

export interface ColumnSetSpec extends BaseComponentSpec {
  kind: "columnSet";
  columns: ColumnSpec[];
  flexMode?: "none" | "stretch" | "flow" | "bisect" | "trisect";
  horizontalSpacing?: string;
  horizontalAlign?: HorizontalAlign;
  backgroundStyle?: string;
  openUrl?: string;
}

export interface CollapsiblePanelHeaderSpec {
  title?: TextSpec;
  backgroundColor?: string;
  width?: "fill" | "auto" | "autoWhenFold";
  verticalAlign?: VerticalAlign;
  icon?: IconSpec;
  iconPosition?: "left" | "right" | "followText";
  iconExpandedAngle?: -180 | -90 | 90 | 180;
}

export interface CollapsiblePanelSpec extends BaseComponentSpec {
  kind: "collapsiblePanel";
  header: CollapsiblePanelHeaderSpec;
  components: ComponentSpec[];
  expanded?: boolean;
  backgroundColor?: string;
  border?: { color?: string; cornerRadius?: string };
  direction?: Direction;
  verticalSpacing?: string;
  horizontalSpacing?: string;
  padding?: string;
}

export interface InteractiveContainerSpec extends BaseComponentSpec {
  kind: "interactiveContainer";
  components: ComponentSpec[];
  behaviors: BehaviorSpec[];
  width?: string;
  height?: string;
  direction?: Direction;
  horizontalAlign?: HorizontalAlign;
  verticalAlign?: VerticalAlign;
  backgroundStyle?: string;
  hasBorder?: boolean;
  borderColor?: string;
  cornerRadius?: string;
  padding?: string;
  disabled?: boolean;
  disabledTips?: string;
  hoverTips?: string;
  confirm?: ConfirmSpec;
}

export type ComponentSpec =
  | MarkdownSpec
  | DivSpec
  | HrSpec
  | ImageSpec
  | ButtonSpec
  | InputSpec
  | StaticSelectSpec
  | FormSpec
  | TableSpec
  | ColumnSpec
  | ColumnSetSpec
  | CollapsiblePanelSpec
  | InteractiveContainerSpec;

export interface BlockSpec {
  kind: "block";
  components: ComponentSpec[];
}

export interface HeaderTagSpec {
  text: string;
  color?: string;
}

export interface HeaderSpec {
  title: TextSpec;
  subtitle?: TextSpec;
  theme?:
    | "blue"
    | "wathet"
    | "turquoise"
    | "green"
    | "yellow"
    | "orange"
    | "red"
    | "carmine"
    | "violet"
    | "purple"
    | "indigo"
    | "grey"
    | "default";
  tags?: HeaderTagSpec[];
  icon?: IconSpec;
  padding?: string;
}

export interface CardConfigSpec {
  updateMulti?: true;
  widthMode?: "default" | "compact" | "fill";
  enableForward?: boolean;
  summary?: string;
  streamingMode?: boolean;
  streamingConfig?: {
    printFrequencyMs?: {
      default?: number;
      android?: number;
      ios?: number;
      pc?: number;
    };
    printStep?: {
      default?: number;
      android?: number;
      ios?: number;
      pc?: number;
    };
    printStrategy?: "fast" | "delay";
  };
  textStyles?: Record<
    string,
    { default: string; pc?: string; mobile?: string }
  >;
  colorStyles?: Record<
    string,
    { lightMode: string; darkMode: string }
  >;
}

export interface BodyLayoutSpec {
  direction?: Direction;
  padding?: string;
  horizontalSpacing?: string;
  verticalSpacing?: string;
  horizontalAlign?: HorizontalAlign;
  verticalAlign?: VerticalAlign;
}

export interface CardLinkSpec {
  url: string;
  pcUrl?: string;
  iosUrl?: string;
  androidUrl?: string;
}

export interface CardSpec {
  specVersion: 1;
  kind: "card";
  cardKey?: string;
  config?: CardConfigSpec;
  header?: HeaderSpec;
  body?: BodyLayoutSpec;
  cardLink?: CardLinkSpec;
  blocks: BlockSpec[];
}

export interface CardIssue {
  code: string;
  path: string;
  message: string;
}

export interface ElementIndexEntry {
  part: number;
  elementId: string;
  kind: ComponentSpec["kind"];
  streamable: boolean;
}

export interface CompiledCardPart {
  part: number;
  total: number;
  componentCount: number;
  serializedBytes: number;
  cardDigest: string;
  card: JsonObject;
}

export type CompiledCards =
  | {
      ok: true;
      cards: CompiledCardPart[];
      builderVersion: string;
      rulesSnapshot: string;
      specDigest: string;
      bundleDigest: string;
      /** @deprecated Use rulesSnapshot. */
      snapshot: string;
      elementIndex: Record<string, ElementIndexEntry>;
    }
  | {
      ok: false;
      issues: CardIssue[];
    };

export interface CompileOptions {
  targetBudget?: number;
  consumerLimits?: {
    maxCardBytes?: number;
    maxCallbackBytes?: number;
  };
}
