import { Link } from "react-router-dom";

export function Footer() {
    return ( 
        <footer className="w-full mt-auto bg-[#4F46E5] text-white py-3">      
            <div className="container mx-auto px-4">
                <div className="text-center">
                    <div className="flex flex-col sm:flex-row justify-center items-center gap-2 sm:gap-4 mb-2">
                        <Link to="/terms-of-service" className="text-blue-300 hover:underline">
                            Terms of Service
                        </Link>
                        <span className="hidden sm:inline">and</span>
                        <Link to="/privacy-policy" className="text-blue-300 hover:underline">
                            Privacy Policy
                        </Link>
                    </div>

                    <p className="text-sm">© 2026 ACE Software Solutions Private Limited. All rights reserved.</p>
                </div>
            </div>
        </footer>
    )
}