# ImageOptix by Birjot

ImageOptix is a powerful, locally-run image optimization tool built with Next.js. It allows you to convert and compress your images in batches, right on your own computer, ensuring privacy and speed.

## Getting Started

To run this application on your local machine, please follow these simple steps. No cloud services or internet connection are required for the image processing itself.

### Prerequisites

You need to have [Node.js](https://nodejs.org/en) (version 18 or later) installed on your computer.

### 1. Install Dependencies

Open your terminal, navigate to the folder where you've saved the project, and run the following command. This will download and install all the required packages for the application to run.

```bash
npm install
```

### 2. Run the Development Server

Once the installation is complete, run the following command in the same terminal window. This starts the local server that powers the application.

```bash
npm run dev
```

### 3. Open the App in Your Browser

The server will start, and you'll see a message in your terminal, usually `ready - started server on 0.0.0.0:9002, url: http://localhost:9002`.

You can now access the application by opening your web browser (like Chrome, Firefox, or Safari) and navigating to the following address:

[http://localhost:9002](http://localhost:9002)

That's it! You can now start uploading and optimizing your images.

---

## Technical Details: How It Works

This section provides a deeper look into the application's architecture and functionality.

### Core Technology

- **Framework**: Built with **Next.js**, a React framework that enables a modern, server-driven web application architecture.
- **Image Processing**: Image manipulation is handled by the **`sharp`** library, a high-performance Node.js module. It is one of the fastest libraries available for resizing, converting, and compressing images (JPEG, PNG, WebP, AVIF, etc.).
- **User Interface**: The UI is built with **React** and styled using **Tailwind CSS** with **ShadCN UI** components for a clean and responsive design.

### Local Processing Engine

A key feature of ImageOptix is that **all processing happens on your local machine**. Here's a breakdown of the workflow:

1.  **File Upload**: When you drag-and-drop or select images, they are loaded directly into your browser's memory. They are not uploaded to a remote server.
2.  **Server Actions**: When you click "Process & Download", the application uses a Next.js feature called **Server Actions**. This securely sends the image data and your chosen optimization settings from the browser-based UI to the local Node.js server running on your machine.
3.  **`sharp` Execution**: The local server receives the data and uses the `sharp` library to perform the conversions and optimizations. This entire process utilizes your computer's CPU and memory, ensuring your files remain private.
4.  **Download**: Once processing is complete, the optimized files are sent back to your browser, and a download is initiated. If you process multiple files, they are bundled into a `.zip` archive for your convenience.

This architecture provides the speed and power of server-side processing without the privacy concerns or costs associated with a cloud-based service.
