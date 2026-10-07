// Essay images can carry a size in their markdown title, set from the Size
// dropdown in the Keystatic editor:  ![alt](/images/essays/x/y.png "medium")
// This Sätteri hast plugin turns that title into a class (img-medium) and drops
// the title so it doesn't show up as a hover tooltip.
const SIZES = new Set(['large', 'medium', 'small']);

export const imageSizes = {
  name: 'image-sizes',
  element: {
    filter: ['img'],
    visit(node, ctx) {
      const size = node.properties?.title;
      if (!SIZES.has(size)) return;
      const classes = node.properties.className ?? [];
      ctx.setProperty(node, 'className', [...classes, `img-${size}`]);
      ctx.setProperty(node, 'title', null);
    },
  },
};
