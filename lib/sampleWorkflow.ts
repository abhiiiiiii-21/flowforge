/**
 * Sample workflow graph seeded for brand-new users.
 *
 * This is a marketing-copywriting pipeline:
 *   upload_image → crop_image → LLM (product description)
 *   upload_video → extract_frame → LLM (social media post)
 */
export const SAMPLE_WORKFLOW_GRAPH = {
  nodes: [
    {
      id: "node_1777167546171_1",
      type: "text",
      data: {
        text: "You are a professional marketing copywriter. Generate a compelling one-paragraph product description.",
        label: "text",
      },
      position: { x: 208, y: -240 },
    },
    {
      id: "node_1777167551303_2",
      type: "text",
      data: {
        text: "Product: Wireless Bluetooth Headphones. Features: Noise cancellation, 30-hour battery, foldable design.\n",
        label: "text",
      },
      position: { x: 208, y: 32 },
    },
    {
      id: "node_1777167798193_3",
      type: "text",
      data: {
        text: "You are a social media manager. Create a tweet-length marketing post based on the product image and video frame.",
        label: "text",
      },
      position: { x: 576, y: 544 },
    },
    {
      id: "node_1777167972971_5",
      type: "crop_image",
      data: {
        label: "crop_image",
        xPercent: 10,
        yPercent: 15.51,
        aspectRatio: "1:1",
        widthPercent: 80,
        heightPercent: 80,
      },
      position: { x: 576, y: 224 },
    },
    {
      id: "node_1777168010523_6",
      type: "llm",
      data: {
        label: "llm",
        model: "gemini-3-flash-preview",
        outputType: "text",
      },
      position: { x: 992, y: -416 },
    },
    {
      id: "node_1777168085363_7",
      type: "extract_frame",
      data: {
        label: "extract_frame",
        timestamp: 0,
        framePercent: 2,
        timestampMode: "percent",
      },
      position: { x: 672, y: 832 },
    },
    {
      id: "node_1777168263604_9",
      type: "llm",
      data: {
        label: "llm",
        model: "gemini-3-flash-preview",
        outputType: "text",
      },
      position: { x: 1408, y: 256 },
    },
    {
      id: "node_1778563258194_3",
      type: "upload_image",
      data: {
        label: "upload_image",
        fileName: "headphones.jpg",
        fileSize: 59715,
        fileType: "image/jpeg",
        previewUrl:
          "https://pub-50c02411c3544162994b4f578dbe9bf9.r2.dev/uploads/89/d78a6a92a94a08aacfc20709aedd77/headphones.jpg",
      },
      position: { x: -272, y: 304 },
    },
    {
      id: "node_1778563281260_4",
      type: "upload_video",
      data: {
        label: "upload_video",
        fileName: "8004701-uhd_3840_2160_25fps.mp4",
        fileSize: 6041691,
        fileType: "video/mp4",
        previewUrl:
          "https://pub-50c02411c3544162994b4f578dbe9bf9.r2.dev/uploads/b9/92eb9b4e7149f8840ee5b83dd8625a/8004701-uhd_3840_2160_25fps.mp4",
      },
      position: { x: -272, y: 896 },
    },
  ],
  edges: [
    {
      source: "node_1777167551303_2",
      target: "node_1777168010523_6",
      sourceHandle: "text-out",
      targetHandle: "user-message-in",
    },
    {
      source: "node_1777167546171_1",
      target: "node_1777168010523_6",
      sourceHandle: "text-out",
      targetHandle: "system-prompt-in",
    },
    {
      source: "node_1777167972971_5",
      target: "node_1777168010523_6",
      sourceHandle: "image-out",
      targetHandle: "images-in",
    },
    {
      source: "node_1777167798193_3",
      target: "node_1777168263604_9",
      sourceHandle: "text-out",
      targetHandle: "system-prompt-in",
    },
    {
      source: "node_1777168010523_6",
      target: "node_1777168263604_9",
      sourceHandle: "text-out",
      targetHandle: "user-message-in",
    },
    {
      source: "node_1777168085363_7",
      target: "node_1777168263604_9",
      sourceHandle: "image-out",
      targetHandle: "images-in",
    },
    {
      source: "node_1777167972971_5",
      target: "node_1777168263604_9",
      sourceHandle: "image-out",
      targetHandle: "images-in",
    },
    {
      source: "node_1778563258194_3",
      target: "node_1777167972971_5",
      sourceHandle: "image-out",
      targetHandle: "image-in",
    },
    {
      source: "node_1778563281260_4",
      target: "node_1777168085363_7",
      sourceHandle: "video-out",
      targetHandle: "video-in",
    },
  ],
}
