import { type FormEvent, useState } from 'react'
import Navbar from "~/components/Navbar";
import FileUploader from "~/components/FileUploader";
import { usePuterStore } from "~/lib/puter";
import { useNavigate } from "react-router";
import { convertPdfToImage } from "~/lib/pdf2img";
import { generateUUID } from "~/lib/utils";
import { prepareInstructions } from "../../constants";

const Upload = () => {
    const { fs, ai, kv } = usePuterStore();
    const navigate = useNavigate();
    const [isProcessing, setIsProcessing] = useState(false);
    const [statusText, setStatusText] = useState('');
    const [file, setFile] = useState<File | null>(null);

    const handleFileSelect = (file: File | null) => {
        setFile(file)
    }

    const handleAnalyze = async ({
        companyName,
        jobTitle,
        jobDescription,
        file
    }: {
        companyName: string,
        jobTitle: string,
        jobDescription: string,
        file: File
    }) => {
        setIsProcessing(true);

        // ✅ Upload PDF (just for storage)
        setStatusText('Uploading the file...');
        const uploadedFile = await fs.upload([file]);
        if (!uploadedFile) return setStatusText('Error: Failed to upload file');

        // ✅ Convert PDF → Image
        setStatusText('Converting to image...');
        const imageFile = await convertPdfToImage(file);
        if (!imageFile.file) return setStatusText('Error: Failed to convert PDF to image');

        // ✅ Upload Image
        setStatusText('Uploading the image...');
        const uploadedImage = await fs.upload([imageFile.file]);
        if (!uploadedImage) return setStatusText('Error: Failed to upload image');

        // ✅ Save initial data
        setStatusText('Preparing data...');
        const uuid = generateUUID();

        const data = {
            id: uuid,
            resumePath: uploadedFile.path,
            imagePath: uploadedImage.path,
            companyName,
            jobTitle,
            jobDescription,
            feedback: '',
        };

        await kv.set(`resume:${uuid}`, JSON.stringify(data));

        // ✅ ANALYSIS (🔥 FIX HERE)
        setStatusText('Analyzing...');

        const feedback = await ai.chat(
            [
                {
                    role: "user",
                    content: [
                        {
                            type: "image", // 🔥 IMPORTANT
                            puter_path: uploadedImage.path // 🔥 IMAGE NOT PDF
                        },
                        {
                            type: "text",
                            text: prepareInstructions({ jobTitle, jobDescription })
                        }
                    ]
                }
            ],
            undefined,
            false,
            { model: "openai/gpt-5.4" }
        );

        if (!feedback) return setStatusText('Error: Failed to analyze resume');

        // ✅ SAFE PARSE (no crash)
        const content = feedback.message.content;

        const feedbackText =
            typeof content === 'string'
                ? content
                : content?.[0]?.text || '';

        let parsed;
        try {
            parsed = JSON.parse(feedbackText);
        } catch {
            parsed = { raw: feedbackText };
        }

        data.feedback = parsed;

        await kv.set(`resume:${uuid}`, JSON.stringify(data));

        setStatusText('Analysis complete, redirecting...');
        console.log(data);

        navigate(`/resume/${uuid}`);
    }

    const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        const form = e.currentTarget;
        const formData = new FormData(form);

        const companyName = formData.get('company-name') as string;
        const jobTitle = formData.get('job-title') as string;
        const jobDescription = formData.get('job-description') as string;

        if (!file) return;

        handleAnalyze({ companyName, jobTitle, jobDescription, file });
    }

    return (
        <main className="bg-[url('/images/bg-main.svg')] bg-cover">
            <Navbar />

            <section className="main-section">
                <div className="page-heading py-16">
                    <h1>Smart feedback for your dream job</h1>

                    {isProcessing ? (
                        <>
                            <h2>{statusText}</h2>
                            <img src="/images/resume-scan.gif" className="w-full" />
                        </>
                    ) : (
                        <h2>Drop your resume for an ATS score and improvement tips</h2>
                    )}

                    {!isProcessing && (
                        <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-8">
                            <div className="form-div">
                                <label>Company Name</label>
                                <input type="text" name="company-name" />
                            </div>

                            <div className="form-div">
                                <label>Job Title</label>
                                <input type="text" name="job-title" />
                            </div>

                            <div className="form-div">
                                <label>Job Description</label>
                                <textarea rows={5} name="job-description" />
                            </div>

                            <div className="form-div">
                                <label>Upload Resume</label>
                                <FileUploader onFileSelect={handleFileSelect} />
                            </div>

                            <button className="primary-button" type="submit">
                                Analyze Resume
                            </button>
                        </form>
                    )}
                </div>
            </section>
        </main>
    );
};

export default Upload;