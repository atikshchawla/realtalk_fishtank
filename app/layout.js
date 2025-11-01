import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin"],
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
});

export const metadata = {
	title: "RealTalk Audio - Voice Authentication Dashboard",
	description:
		"Advanced voice authentication system with real-time analysis and AI detection",
	viewport: "width=device-width, initial-scale=1.0, viewport-fit=cover",
};

export default function RootLayout({ children }) {
	return (
		<html lang="en" className="min-h-full">
			<head>
				<meta
					name="viewport"
					content="width=device-width, initial-scale=1.0, viewport-fit=cover"
				/>
			</head>
			<body
				className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-full m-0 p-0`}
			>
				{children}
			</body>
		</html>
	);
}
