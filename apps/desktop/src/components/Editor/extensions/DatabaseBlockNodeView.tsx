import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { DatabaseView } from '../../DatabaseView';

export function DatabaseBlockNodeView(props: NodeViewProps): JSX.Element {
  const viewId = String(props.node.attrs.viewId ?? '');

  return (
    <NodeViewWrapper
      as="div"
      data-ziba-db={viewId}
      contentEditable={false}
      className="ziba-database-block my-5"
    >
      <DatabaseView
        embedded
        initialViewId={viewId}
        onActiveViewChange={(nextViewId): void => {
          if (nextViewId !== viewId) props.updateAttributes({ viewId: nextViewId });
        }}
      />
    </NodeViewWrapper>
  );
}
