import Image from 'next/image';
import Link from 'next/link';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFireFlameCurved, faGraduationCap, faHeart, faArrowRight, faCalendarAlt, faCheckCircle } from '@fortawesome/free-solid-svg-icons';

export default function Page() {
  return (
    <main className="min-h-screen bg-[#2f2f2f]">
      {/* Hero Section */}
      <section className="pt-24 pb-6 md:pt-36 md:pb-16 flex items-center justify-center">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-[#f5ddd8] mb-4">
            Refreshingly Simple <span className="text-[#E03131]">Planning</span>
          </h1>
          <p className="text-lg md:text-xl text-[#e4ccc7] mb-6 max-w-3xl mx-auto">
            A smart 4-year planner designed specifically for UMD students to map out 
            their courses, track requirements, and graduate on time.
          </p>
          <div className="flex gap-4 justify-center mb-5">
            <Link 
              href="/schedule"
              className="group bg-[#E03131] text-white px-6 py-2 rounded-lg hover:bg-[#C92A2A] transition-all duration-200 font-semibold flex items-center gap-2"
            >
              Enter App <FontAwesomeIcon icon={faArrowRight} className="transform group-hover:scale-125 transition-transform duration-200" />
            </Link>
            <a 
              href="#about"
              className="border border-[#1B2B4B] text-[#6686c6] px-6 py-2 rounded-lg hover:bg-[#6686c6] hover:text-white transition-all duration-200 font-semibold inline-flex items-center"
            >
              Learn More
            </a>
          </div>
        </div>
      </section>

 
      <section id="features" className="py-0 mt-0">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-6">
            {/*Le Feature 1 */}
            <div className="p-5 rounded-xl bg-white hover:shadow-lg transition-shadow">
              <div className="w-10 h-10 bg-[#FFE3E3] rounded-lg flex items-center justify-center mb-3">
                <svg className="w-5 h-5 text-[#E03131]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold mb-2 text-[#1B2B4B]">4-Year Planning</h3>
              <p className="text-[#4A5568] text-sm">Easily map out your entire academic journey semester by semester to ensure you're on track to graduate.</p>
            </div>

            {/* Da Feature 2 */}
            <div className="p-5 rounded-xl bg-white hover:shadow-lg transition-shadow">
              <div className="w-10 h-10 bg-[#FFE3E3] rounded-lg flex items-center justify-center mb-3">
                <svg className="w-5 h-5 text-[#E03131]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold mb-2 text-[#1B2B4B]">Schedule Making</h3>
              <p className="text-[#4A5568] text-sm">Plan your schedule for next semester with our intuitive tracking system.</p>
            </div>

            {/*Da Feature 3 */}
            <div className="p-5 rounded-xl bg-white hover:shadow-lg transition-shadow">
              <div className="w-10 h-10 bg-[#FFE3E3] rounded-lg flex items-center justify-center mb-3">
                <svg className="w-5 h-5 text-[#E03131]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold mb-2 text-[#1B2B4B]">Requirement Tracking</h3>
              <p className="text-[#4A5568] text-sm">Monitor your progress towards graduation with automatic requirement tracking.</p>
              <br></br>
            </div>
            <br></br><br></br><br></br><br></br><br></br><br></br><br></br>
          </div>
        </div>
      </section>

      {/*About*/}
      <section id="about" className="py-16 bg-[#d7cdcc]">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center justify-center mb-12">
              <div className="w-12 h-1 bg-[#E03131] rounded-full mr-4"></div>
              <h2 className="text-3xl font-bold text-[#1B2B4B]">About Terpsicle</h2>
              <div className="w-12 h-1 bg-[#E03131] rounded-full ml-4"></div>
            </div>
            
            <div className="mb-10 text-center">
              <p className="mb-6 text-[#4A5568] leading-relaxed text-lg">
                Terpsicle is a student-built platform designed to take the stress out of planning your academic journey at UMD.
              </p>
              
              <p className="text-[#4A5568] leading-relaxed text-lg">
                A tool made by terps, for terps, because we're tired of alt-tabbing every semester to figure out what courses you're taking for the next 2 years. Take the stress out of planning your academic journey at UMD.
              </p>
            </div>
            
            <div className="mb-12">
              <div className="flex items-center justify-center mb-4">
                <div className="w-10 h-10 bg-[#FFE3E3] rounded-lg flex items-center justify-center mr-3">
                  <FontAwesomeIcon icon={faCalendarAlt} className="text-[#E03131]" />
                </div>
                <h3 className="text-xl font-semibold text-[#1B2B4B]">Course Scheduler</h3>
              </div>
              
              <p className="text-[#4A5568] leading-relaxed text-center">
                With our course scheduler, you can map out future semesters, explore different class combinations, and see how everything fits into your week. Think Venus and Coursice, but better tailored to UMD curriculum.
              </p>
            </div>
            
            <div>
              <div className="flex items-center justify-center mb-4">
                <div className="w-10 h-10 bg-[#FFE3E3] rounded-lg flex items-center justify-center mr-3">
                  <FontAwesomeIcon icon={faCheckCircle} className="text-[#E03131]" />
                </div>
                <h3 className="text-xl font-semibold text-[#1B2B4B]">Degree Audit</h3>
              </div>
              
              <p className="text-[#4A5568] leading-relaxed text-center">
                We also have our degree audit tool which breaks down what your major actually needs and which core classes you should be taking. Helping make sure you're on track to graduate.
              </p>
            </div>
          </div>
        </div>
      </section>


      {/* Feet */}
      <footer className="bg-[#111827] text-white py-5">
        <div className="container mx-auto px-4">
          <div className="flex flex-col items-center mb--8">
            <div className="flex items-center gap-2 mb--2">
              <FontAwesomeIcon 
                icon={faGraduationCap}
                className="text-[#E03131] text-2xl"
              />
              <span className="text-xl font-semibold">Terpsicle</span>
            </div>
          </div>
          
          <div className="h-px bg-gray-700 w-full my-4"></div>
        
          <div className="text-center text-gray-400">
            <p>© 2025 Terpsicle. Made at BITCAMP <FontAwesomeIcon icon={faFireFlameCurved} className="text-[#E03131]" /></p>
          </div>
        </div>
      </footer>
    </main>
  );
}

